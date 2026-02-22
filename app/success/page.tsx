"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import "./styles.css";
import OSS from "ali-oss";

interface FileObj {
  name: string;
  url: string;
}

function getToday() {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return today;
}

async function getFileList(date: string, client: OSS) {
  const prefix = `${date}/`;
  const fileList = (await client.list({
    prefix: prefix,
  })) as { objects: FileObj[] };
  return fileList.objects.slice(1).map((f) => ({ name: f.name.replace(prefix, ""), url: f.url }));
}

function DropArea({ onUploadSuccess, client }: { onUploadSuccess: () => void; client: OSS }) {
  const [highlight, setHighlight] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [statusText, setStatusText] = useState("Drag & Drop files here");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload files in a list of files
  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;

    setIsUploading(true);
    setStatusText(`Uploading ${files.length} file${files.length > 1 ? "(s)" : ""}...`);

    async function isFileExists(name: string) {
      name = `${getToday()}/${name}`;
      try {
        await client.head(name);
        return true;
      } catch (e: any) {
        if (e.code === "NoSuchKey") {
          return false;
        }
        throw `Error when getting unique file name: ${e}`;
      }
    }

    async function getUniqueFileName(fileName: string) {
      // Get extension name
      let extName = "";
      const parts = fileName.split(".");
      if (parts.length > 1) extName = "." + parts.pop();
      // Get base name
      const baseName = fileName.slice(0, fileName.length - extName.length);

      let i = 0;
      let uniqueName = baseName + extName;
      while (await isFileExists(uniqueName)) {
        i++;
        uniqueName = `${baseName}_${i}${extName}`;
      }
      return uniqueName;
    }

    try {
      // for (const file of files) {
      //   console.log(file);
      //   const cleanName = file.name.replace(/[/\\?%*:|"<>]/g, "_").replace(/\.\./g, "");
      //   const finalName = await getUniqueFileName(cleanName);
      //   await client.put(`${getToday()}/${finalName}`, file);
      // }

      await Promise.all(
        files.map(async (file) => {
          const cleanName = file.name.replace(/[/\\?%*:|"<>]/g, "_").replace(/\.\./g, "");
          const finalName = await getUniqueFileName(cleanName);
          console.log(`starting to put file ${finalName}`);
          console.time(finalName);
          await client.put(`${getToday()}/${finalName}`, file);
          console.log(`finished putting file ${finalName}`);
          console.timeEnd(finalName);
        })
      );

      setStatusText("All files uploaded.");
      onUploadSuccess();
    } catch (err) {
      console.error(err);
      setStatusText("Failed to upload");
    } finally {
      setIsUploading(false);
      setTimeout(() => setStatusText("Drag & Drop files here"), 1500);
    }
  }

  // Call uploadFiles when dropped
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHighlight(false);
    const dt = e.dataTransfer;
    const files = Array.from(dt.files).filter((f) => !f.name.toLowerCase().endsWith(".url"));
    uploadFiles(files);
  };

  return (
    <>
      <label htmlFor="drop-area">Drag & Drop Files</label>
      <div
        id="drop-area"
        className={`drop-area ${highlight ? "highlight" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setHighlight(true);
        }}
        onDragLeave={() => setHighlight(false)}
        onDrop={handleDrop}
      >
        {statusText}
      </div>
      <div>
        <label htmlFor="file">Select File</label>
        <input
          type="file"
          id="file"
          multiple={true}
          ref={fileInputRef}
          onChange={(e) => e.target.files && uploadFiles(Array.from(e.target.files))}
        />
        <button
          type="button"
          id="fileBtn"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? "Sending..." : "Select Files"}
        </button>
      </div>
    </>
  );
}

function Form() {
  const [date, setDate] = useState(getToday());
  const [fileList, setFileList] = useState<{ name: string; url: string }[]>([]);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [OSSClient, setOSSCLIent] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);

  // Get OSS Client
  useEffect(() => {
    const getClient = async () => {
      const response = await fetch("/api/sts");
      if (response.status === 500 || !response.ok) {
        console.error("Error getting sts token");
        return;
      }
      const tokens = await response.json();
      const { accessKeyId, accessKeySecret, stsToken, bucket } = tokens;
      const OSS = (await import("ali-oss")).default;
      const client = new OSS({
        region: "oss-cn-shanghai",
        authorizationV4: true,
        accessKeyId: accessKeyId,
        accessKeySecret: accessKeySecret,
        stsToken: stsToken,
        bucket: bucket,
        secure: true,
      });
      setOSSCLIent(client);
    };
    getClient();
  }, []);

  // Update file list when changing selected
  useEffect(() => {
    const updateDate = async () => {
      if (!OSSClient) return;
      try {
        const newFileList = await getFileList(date, OSSClient);
        setFileList(newFileList);
      } catch {
        console.error(`Error when getting file list of date ${date}`);
      }
    };
    updateDate();
  }, [date, OSSClient]);

  const handleCheck = (name: string) => {
    setSelectedNames((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const handleSelectAll = () => setSelectedNames(fileList.map((f) => f.url));

  const onUploadSuccess = async () => {
    if (date === getToday()) {
      const newFileList = await getFileList(date, OSSClient);
      setFileList(newFileList);
    }
  };

  async function downloadFiles() {
    if (selectedNames.length === 0) return;
    setDownloading(true);
    setSelectedNames([]);
    try {
      if (selectedNames.length === 1) {
        const link = document.createElement("a");
        console.log(`downloading file ${selectedNames[0]}`);
        const fileName = `${date}/${selectedNames[0]}`;
        link.href = OSSClient.signatureUrl(fileName, {
          "content-disposition": `attachment; filename=${selectedNames[0]}`,
        });
        link.download = selectedNames[0];
        link.click();
      } else {
        const params = new URLSearchParams();
        params.append("date", date);
        params.append("files", selectedNames.join(","));

        const a = document.createElement("a");
        a.href = `/api/download?${params.toString()}`;
        console.log(a.href);
        a.target = "_blank";
        a.download = `files_${date}.zip`;
        a.click();
        console.log("clicked");
      }
    } catch (e) {
      alert(`Error when downloading: ${e}`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <form>
      <DropArea onUploadSuccess={onUploadSuccess} client={OSSClient} />
      <div>
        <h3>Fetch File</h3>
        <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="button" id="select-all-btn" onClick={handleSelectAll}>
          Select All
        </button>
        <div id="files">
          {fileList.map((f) => (
            <div className="options" key={f.url}>
              <input
                type="checkbox"
                id={f.url}
                className="checkbox-input"
                checked={selectedNames.includes(f.name)}
                onChange={() => handleCheck(f.name)}
              ></input>
              <label htmlFor={f.url} className="checkbox-label">
                {f.name}
              </label>
            </div>
          ))}
        </div>
        <button type="button" id="fetchBtn" onClick={downloadFiles}>
          {downloading ? "Downloading" : "Fetch"}
        </button>
      </div>
    </form>
  );
}

export default function Success() {
  return (
    <>
      <div className="header">
        <div className="title">File Transfer</div>
        <Link href={"/deepseek"}>DeepSeek</Link>
      </div>
      <Form />
      <footer>&copy; 2025 Jacky</footer>
    </>
  );
}
