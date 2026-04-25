import OSS from "ali-oss";
import { select, input, checkbox, search } from "@inquirer/prompts";
import path from "path";
import { mkdirSync } from "fs";
import fs from "fs/promises";

enum Action {
  upload,
  download,
  delete,
  exit,
}

const client = new OSS({
  region: "oss-cn-shanghai",
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  authorizationV4: true,
  bucket: "files-for-transfer",
  secure: true,
});

async function fileExists(filepath: string): Promise<boolean> {
  return fs.access(filepath).then(
    () => true,
    () => false
  );
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function getFiles(): Promise<string> {
  const cwd = process.cwd();
  const root = path.parse(cwd).root;

  const result = await search({
    message: "Select a file",
    source: async (term = path.basename(cwd)) => {
      let dir = path.resolve(cwd, term);
      while (!(await isDirectory(dir)) && dir != root) {
        dir = path.dirname(dir);
      }
      const list = (await fs.readdir(dir, { withFileTypes: true }))
        .toSorted((a, b) => {
          if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
          return a.isDirectory() ? -1 : 1;
        })
        .map((f) => ({
          name: path.join(f.parentPath, f.name) + (f.isDirectory() ? path.sep : ""),
          value: path.join(f.parentPath, f.name),
        }));

      // Add .. option
      if (dir !== root) {
        let relative = path.relative(cwd, path.dirname(dir));
        if (!relative) relative = ".";
        list.unshift({
          name: relative + path.sep,
          value: path.dirname(dir),
        });
      }

      // return list;
      return list.filter((f) => {
        if (f.name.includes("..")) return true;
        if (term.endsWith("..") || term.endsWith(".." + path.sep)) return true;
        if (path.basename(term) !== path.basename(dir))
          return path.basename(f.name).toLowerCase().startsWith(path.basename(term).toLowerCase());
        else return true;
      });
    },
    validate: async (filePath) => {
      if (!(await fileExists(filePath)) || (await isDirectory(filePath)))
        return "You must select a file";
      else return true;
    },
  });
  return result;
}

async function main() {
  while (true) {
    try {
      const action = await select({
        message: "Select an action",
        choices: [
          { value: Action.upload, name: "1. Upload", description: "Upload some files" },
          { value: Action.download, name: "2. Download", description: "Download some files" },
          { value: Action.delete, name: "3. Delete", description: "Delete some file permenantly" },
          { value: Action.exit, name: "4. Exit" },
        ],
      });

      if (action === Action.exit) process.exit(0);
      else if (action === Action.upload) {
        try {
          const filePath = await getFiles();
          if (!filePath) {
            console.log("Cancel upload");
            continue;
          }

          function getToday() {
            const now = new Date();
            const pad = (n: number) => n.toString().padStart(2, "0");
            const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
            return today;
          }

          const headers = {
            "x-oss-storage-class": "Standard",
            "x-oss-object-acl": "private",
            "x-oss-forbid-overwrite": "false",
          };
          const downloadName = path.basename(filePath);
          const result = await client.put(`files/${getToday()}/${downloadName}`, filePath, {
            headers,
          });
          console.log(`Uploaded file ${downloadName}`);
          console.log(result);
        } catch (e) {
          if (e instanceof Error && e.name === "ExitPromptError") continue;
          else console.log(e);
        }
      } else {
        try {
          const date = await input({
            message: 'Type in the date (formatted in "YYYY-MM-DD")',
            required: true,
            pattern: /\d{4}-\d{2}-\d{2}/,
            patternError: 'Date should be formatted in "YYYY-MM-DD"',
          });

          const fileInfo = await client.list({ prefix: `files/${date}/` });
          const fileList = fileInfo.objects.map((o) => ({
            name: o.name,
            size: o.size,
            storageClass: o.storageClass,
          }));

          const stardard = fileList.filter((o) => o.storageClass === "Standard");

          if (
            fileInfo.objects.length === 0 ||
            (action === Action.download && stardard.length === 0)
          ) {
            console.log(`No files found on date ${date}\n`);
            continue;
          }

          if (action === Action.download) {
            const files = await checkbox({
              message: `Select files to download`,
              choices: stardard.map((f) => ({
                value: f.name,
                name: f.name.slice(17),
                description: `Size: ${f.size / 1024 / 1024 >= 1 ? `${(f.size / 1024 / 1024).toFixed(2)} MB` : `${(f.size / 1024).toFixed(2)} KB`}`,
              })),
              required: true,
            });

            const downloadDir = path.join(process.cwd(), "download", date);
            mkdirSync(downloadDir, { recursive: true });
            await Promise.all(
              files.map(async (f) => {
                console.log(`Start to download file ${f.slice(17)}`);
                await client.get(f, path.join(downloadDir, f.slice(17)));
                console.log(`Downloaded file ${f.slice(17)}`);
              })
            );
            console.log(`Successfully downloaded all files to ${downloadDir}`);
          } else if (action === Action.delete) {
            const files = await checkbox({
              message: `Select files to delete`,
              choices: fileList.map((f) => ({
                value: f.name,
                name: f.name.slice(17),
                description: `Size: ${f.size / 1024 / 1024 >= 1 ? `${(f.size / 1024 / 1024).toFixed(2)} MB` : `${(f.size / 1024).toFixed(2)} KB`}`,
              })),
              required: true,
            });

            console.log("Deleting...");
            await client.deleteMulti(files);
            console.log("Successfully deleted");
          }
        } catch (e) {
          if (e instanceof Error)
            if (e.name === "ExitPromptError") continue;
            else console.log(e);
        }
      }
    } catch (e) {
      if (e instanceof Error)
        if (e.name === "ExitPromptError") process.exit(0);
        else console.error(e.message);
    }

    console.log();
  }
}

main().catch((e) => console.error(e));
