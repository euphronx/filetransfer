"use client";
import { useState, useEffect } from "react";
import OSS from "ali-oss";
import "./styles.css";

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

export default function Delete() {
  const [date, setDate] = useState(getToday());
  const [fileList, setFileList] = useState<{ name: string; url: string }[]>([]);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [OSSClient, setOSSCLIent] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  // Get OSS Client
  useEffect(() => {
    const getClient = async () => {
      const response = await fetch("/api/auth");
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

  async function deleteFiles() {
    setDeleting(true);
    setSelectedNames([]);
    console.log("started deleting");
    try {
      await Promise.all(
        selectedNames.map((f) => {
          const fileName = `${date}/${f}`;
          OSSClient.delete(fileName);
        })
      );
    } catch (e) {
      alert(`Failed to delete: ${e}`);
    } finally {
      setDeleting(false);
      const newFileList = await getFileList(date, OSSClient);
      setFileList(newFileList);
    }
  }

  return (
    <form>
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
        <button type="button" id="deleteBtn" onClick={deleteFiles}>
          {deleting ? "Deleting" : "Delete"}
        </button>
      </div>
    </form>
  );
}
