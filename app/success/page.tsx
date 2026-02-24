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

  return fileList.objects
    .filter((f) => f.name !== prefix)
    .map((f) => ({ name: f.name.replace(prefix, ""), url: f.url }));
}

function DropArea({ onUploadFinished, client }: { onUploadFinished: () => void; client: OSS }) {
  const [highlight, setHighlight] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [statusText, setStatusText] = useState("Drag & Drop files here");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload files in a list of files
  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;

    setIsUploading(true);
    setStatusText(`Uploading ${files.length} file${files.length > 1 ? "(s)" : ""}...`);

    async function getUniqueFileName(fileName: string) {
      const fileList = await getFileList(getToday(), client);
      const isFileExists = async (name: string) => fileList.some((f) => f.name === name);

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
    } catch (err) {
      console.error(err);
      setStatusText("Failed to upload");
    } finally {
      setIsUploading(false);
      setTimeout(() => setStatusText("Drag & Drop files here"), 1500);
      onUploadFinished();
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
  const [jwtToken, setJwtToken] = useState<any>(null);
  const [downloadUrl, setDownloadUrl] = useState("");
  let expireTimeout: NodeJS.Timeout | null = null;

  // Get jwt token and client
  useEffect(() => {
    const getAuth = async () => {
      const jwtRes = await fetch("/auth");
      if (jwtRes.status === 500 || !jwtRes.ok) throw new Error("Failed to get JWT");
      const { jwtToken } = await jwtRes.json();
      setJwtToken(jwtToken);

      const stsRes = await fetch("https://oss-zipper-xvgsgppblx.cn-shanghai.fcapp.run/auth", {
        headers: {
          "Authorization": `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
      });
      if (stsRes.status === 500 || !stsRes.ok) {
        console.error(await stsRes.json());
        throw new Error("Failed to get STS");
      }
      const { accessKeyId, accessKeySecret, stsToken, bucket } = await stsRes.json();
      const OSS = (await import("ali-oss")).default;
      const client = new OSS({
        region: "oss-cn-shanghai",
        authorizationV4: true,
        accessKeyId,
        accessKeySecret,
        stsToken,
        bucket,
        secure: true,
      });
      setOSSCLIent(client);
    };
    getAuth();
  }, []);

  // Update file list when changing selected date
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

  const handleSelectAll = () =>
    fileList.length === selectedNames.length
      ? setSelectedNames([])
      : setSelectedNames(fileList.map((f) => f.name));

  const onUploadFinished = async () => {
    if (date === getToday()) {
      const newFileList = await getFileList(date, OSSClient);
      setFileList(newFileList);
    }
  };

  async function downloadFiles() {
    if (selectedNames.length === 0) return;
    setDownloadUrl("");
    setDownloading(true);
    setSelectedNames([]);
    if (expireTimeout) clearTimeout(expireTimeout);
    try {
      if (selectedNames.length === 1) {
        const link = document.createElement("a");
        console.log(`downloading file ${selectedNames[0]}`);
        const fileName = `${date}/${selectedNames[0]}`;
        const url = OSSClient.signatureUrl(fileName, {
          "content-disposition": `attachment; filename=${selectedNames[0]}`,
          "expires": 300,
        });
        link.href = url;
        link.download = selectedNames[0];
        link.click();
        setDownloadUrl(url);
        expireTimeout = setTimeout(() => setDownloadUrl(""), 300000);
      } else {
        const body = {
          date: date,
          files: selectedNames,
        };
        const response = await fetch(
          "https://oss-zipper-xvgsgppblx.cn-shanghai.fcapp.run/download",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${jwtToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) throw "encounter an error when fetching file link";
        const { name } = await response.json();

        const a = document.createElement("a");
        const url = OSSClient.signatureUrl(name, {
          "content-disposition": `attachment; filename=${name}`,
          "expires": 300,
        });
        a.href = url;
        a.download = name;
        a.click();
        setDownloadUrl(url);
        expireTimeout = setTimeout(() => setDownloadUrl(""), 300000);
      }
    } catch (e) {
      alert(`Error when downloading: ${e}`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <form>
      <DropArea onUploadFinished={onUploadFinished} client={OSSClient} />
      <div>
        <h3>Fetch File</h3>
        <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="button" id="select-all-btn" onClick={handleSelectAll}>
          {fileList.length === selectedNames.length ? "Deselect" : "Select All"}
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
        <p className="url" style={downloadUrl ? { display: "block" } : { display: "none" }}>
          Download should have begun, or click <a href={downloadUrl}>here</a> to download.
          <br />
          Notice: The URL will expire in 5 minutes.
        </p>
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
      <footer>&copy; 2026 Jacky</footer>
    </>
  );
}
