"use client";
import {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  useMemo,
  type Dispatch,
  SetStateAction,
} from "react";
import Link from "next/link";
import "./styles.css";
import OSS from "ali-oss";

const authContext = createContext<Dispatch<
  SetStateAction<{ state: number; message: string }>
> | null>(null);

interface FileObj {
  name: string;
  url: string;
  storageClass: string;
}

const pad = (n: number) => n.toString().padStart(2, "0");
const padDate = (time: Date) =>
  `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;

function getToday() {
  const now = new Date();
  return padDate(now);
}

async function getFileList(date: string | null, client: OSS) {
  if (date) {
    const prefix = `files/${date}/`;
    const fileList = (await client.list({
      prefix: prefix,
    })) as { objects: FileObj[] };

    return fileList.objects
      .filter((f) => f.name !== prefix)
      .filter((f) => f.storageClass === "Standard")
      .map((f) => ({ name: f.name.replace(prefix, ""), url: f.url }));
  }

  const now = new Date();
  now.setDate(now.getDate() + 1);
  const fileList: { name: string; url: string }[] = [];
  for (let i = 0; i < 7; i++) {
    now.setDate(now.getDate() - 1);
    const prefix = `files/${padDate(now)}/`;
    const list = (await client.list({
      prefix: prefix,
    })) as { objects: FileObj[] };
    const final = list.objects
      .filter((f) => f.name !== prefix)
      .filter((f) => f.storageClass === "Standard")
      .map((f) => ({ name: f.name.replace("files/", ""), url: f.url }));

    console.log(prefix, final);
    fileList.push(...final);
  }

  console.log("finallist: ", fileList);

  return fileList;
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
          await client.put(`files/${getToday()}/${finalName}`, file);
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

function Search({
  fileList,
  setDate,
}: {
  fileList: { name: string }[];
  setDate: Dispatch<SetStateAction<string>>;
}) {
  const [searchText, setSearchText] = useState("");
  const [reg, setReg] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const files = useMemo(() => {
    return fileList.map((f) => {
      const parts = f.name.split("/");
      const date = parts.shift()!;
      return { date, name: parts.join("/") };
    });
  }, [fileList]);

  const list = useMemo(() => {
    if (!searchText) return [];
    try {
      if (reg) {
        const regText = new RegExp(searchText, "i");
        return files.filter((f) => regText.test(f.name));
      }
      return files.filter((f) => f.name.toLowerCase().includes(searchText.toLowerCase()));
    } catch {
      return [];
    }
  }, [searchText, reg, files]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (list.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < list.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : list.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < list.length) {
        const selected = list[activeIndex];
        setDate(selected.date);
        setSearchText("");
      }
    }
  };

  return (
    <div className="search-container">
      <div className={`search-box ${list && list.length > 0 ? "search-content" : ""}`}>
        <input
          type="text"
          className="search-input"
          placeholder="Search files"
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
        ></input>
        <button
          title="Use Reg Expression"
          className={`reg-btn ${reg ? "selected" : ""}`}
          type="button"
          onClick={() => {
            setReg(!reg);
          }}
        >
          .*
        </button>
      </div>
      {searchText && list.length > 0 && (
        <ul className="search-result">
          {list.map((f, idx) => (
            <li
              key={`${f.date}/${f.name}`}
              className={idx === activeIndex ? "active" : ""}
              onClick={() => {
                setDate(f.date!);
                setSearchText("");
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <span className="file-name">{f.name}</span>
              <span className="date">{f.date}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
  const setAuthState = useContext(authContext)!;
  let expireTimeout: NodeJS.Timeout | null = null;

  // Get jwt token and client
  useEffect(() => {
    const getAuth = async () => {
      const jwtRes = await fetch("/auth");
      if (jwtRes.status === 500 || !jwtRes.ok) {
        setAuthState({
          state: 2,
          message: "Failed to authenticate",
        });
        throw new Error("Failed to get JWT");
      }
      const { accessKeyId, accessKeySecret, stsToken, bucket, jwtToken } = await jwtRes.json();
      setJwtToken(jwtToken);
      setAuthState({
        state: 1,
        message: "Successfully authenticated",
      });
      setTimeout(setAuthState, 3000, "");

      // Wake up the FC server
      fetch("https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run/wakeup", {
        headers: {
          "Authorization": `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
      });

      const OSS = (await import("ali-oss")).default;
      const client = new OSS({
        region: "oss-cn-shanghai",
        authorizationV4: true,
        secure: true,
        bucket: bucket,
        accessKeyId,
        accessKeySecret,
        stsToken,
        refreshSTSToken: async () => {
          try {
            const response = await fetch("/auth");
            const { accessKeyId, accessKeySecret, stsToken } = await response.json();
            return { accessKeyId, accessKeySecret, stsToken };
          } catch {
            throw new Error("Failed to get STS");
          }
        },
        refreshSTSTokenInterval: 3600000,
      });
      setOSSCLIent(client);
    };
    getAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update file list when changing selected date
  useEffect(() => {
    const updateDate = async () => {
      if (!OSSClient) return;
      setSelectedNames([]);
      if (date !== getToday()) return;
      try {
        const newFileList = await getFileList(null, OSSClient);
        console.log(newFileList);
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
    fileList.filter((f) => f.name.startsWith(`${date}/`)).length === selectedNames.length
      ? setSelectedNames([])
      : setSelectedNames(fileList.filter((f) => f.name.startsWith(`${date}/`)).map((f) => f.name));

  const onUploadFinished = async () => {
    if (date === getToday()) {
      const newFileList = await getFileList(null, OSSClient);
      setFileList(newFileList);
    }

    let ok = false;
    let retries = 0;
    while (!ok && retries < 5) {
      console.log("fetch /zip");
      const response = await fetch("https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run/zip", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 201) {
        ok = true;
        const result = await response.json();
        console.log(result.name);
      } else {
        retries++;
        if (retries < 5) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
        }
      }
    }
  };

  async function downloadFiles() {
    if (selectedNames.length === 0) return;
    setDownloadUrl("");
    setDownloading(true);
    const link = document.createElement("a");
    if (expireTimeout) clearTimeout(expireTimeout);
    try {
      if (selectedNames.length === 1) {
        console.log(`downloading file ${selectedNames[0]}`);
        const fileName = `files/${selectedNames[0]}`;
        const url = OSSClient.signatureUrl(fileName, {
          "content-disposition": `attachment; filename=${selectedNames[0]}`,
          "expires": 300,
        });
        link.href = url;
        link.download = selectedNames[0];
      } else if (
        selectedNames.length === fileList.filter((f) => f.name.startsWith(`${date}/`)).length
      ) {
        const zipName = `zips/files_${date}.zip`;
        link.href = OSSClient.signatureUrl(zipName, {
          "content-disposition": `attachment; filename=${zipName}`,
          "expires": 300,
        });
      } else {
        const body = {
          date: date,
          files: selectedNames.map((f) => f.replace(`${date}/`, "")),
        };
        const response = await fetch(
          "https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run/download",
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
        const zipName = `zips/files_${date}.zip`;

        const url = OSSClient.signatureUrl(`zips/${name}`, {
          "content-disposition": `attachment; filename=${encodeURIComponent(zipName)}`,
          "expires": 300,
        });
        link.href = url;
        link.download = zipName;
      }
    } catch (e) {
      alert(`Error when downloading: ${e}`);
    } finally {
      setDownloadUrl(link.href);
      link.click();
      setDownloading(false);
      setSelectedNames([]);
      expireTimeout = setTimeout(() => setDownloadUrl(""), 300000);
    }
  }

  return (
    <form className="file-form">
      <DropArea onUploadFinished={onUploadFinished} client={OSSClient} />
      <div>
        <div className="fetch-header">
          <h3>Fetch File</h3>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button type="button" id="select-all-btn" onClick={handleSelectAll}>
            {fileList.filter((f) => f.name.startsWith(`${date}/`)).length === selectedNames.length
              ? "Deselect"
              : "Select All"}
          </button>
          <Search fileList={fileList} setDate={setDate} />
        </div>
        <div id="files">
          {fileList
            .filter((f) => f.name.startsWith(`${date}/`))
            .map((f) => (
              <div className="options" key={f.url}>
                <input
                  type="checkbox"
                  id={f.url}
                  className="checkbox-input"
                  checked={selectedNames.includes(f.name)}
                  onChange={() => handleCheck(f.name)}
                ></input>
                <label htmlFor={f.url} className="checkbox-label">
                  {f.name.replace(`${date}/`, "")}
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
  const [authState, setAuthState] = useState({ state: 0, message: "Authenticating..." });
  return (
    <>
      {authState.message && (
        <div
          className={
            "floating" + (authState.state === 0 ? "" : authState.state === 1 ? " success" : " fail")
          }
        >
          {authState.message}
        </div>
      )}
      <div className="header">
        <div className="title">File Transfer</div>
        <Link href={"/deepseek"}>DeepSeek</Link>
        <Link href={"/?change"}>Change Room</Link>
      </div>
      <authContext.Provider value={setAuthState}>
        <Form />
      </authContext.Provider>

      <footer>&copy; 2026 Jacky</footer>
    </>
  );
}
