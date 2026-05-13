"use client";
import { useState, useEffect } from "react";
import OSS from "ali-oss";
import "./styles.css";
import dynamic from "next/dynamic";

interface FileObj {
  name: string;
  url: string;
  storageClass: string;
  size: number;
}

const pad = (n: number) => n.toString().padStart(2, "0");
const padDate = (time: Date) =>
  `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;

function getToday() {
  const now = new Date();
  return padDate(now);
}

async function getFileList(date: string, client: OSS) {
  const prefix = `files/${date}/`;
  const fileList = (await client.list({
    prefix: prefix,
  })) as { objects: FileObj[] };

  return fileList.objects
    .filter((f) => f.name !== prefix)
    .map((f) => ({ name: f.name.replace(prefix, ""), url: f.url }));
}

function DeleteForm({ OSSClient, jwtToken }: { OSSClient: OSS; jwtToken: string }) {
  const [date, setDate] = useState(getToday());
  const [fileList, setFileList] = useState<{ name: string; url: string }[]>([]);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

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

  // Delete multiple files
  async function deleteFiles() {
    if (selectedNames.length === 0) return;
    if (!window.confirm("Sure to delete?")) return;

    setDeleting(true);
    setSelectedNames([]);
    try {
      const files = selectedNames.map((f) => `files/${date}/${f}`);
      await OSSClient!.deleteMulti(files);
      fetch("https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run/oper", {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          oper: "delete",
          files: files.map((f) => f.slice(17)),
          date,
        }),
      });

      (async function () {
        if (window.confirm("Send /zip request?")) {
          const response = await fetch(
            "https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run/zip",
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${jwtToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (response.status === 201) {
            const result = await response.json();
            console.log(result.name);
          } else {
            window.alert("Failed to zip");
          }
        }
      })();
    } catch (e) {
      window.alert(`Failed to delete: ${e}`);
    } finally {
      setDeleting(false);
      const newFileList = await getFileList(date, OSSClient!);
      setFileList(newFileList);
    }
  }

  return (
    <form className="delete-form">
      <div>
        <h3>Delete Files</h3>
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

function CreateRoom({ jwtToken }: { jwtToken: string }) {
  const [name, setName] = useState("");
  const [pwd, setPwd] = useState("");
  const [btnMsg, setBtnMsg] = useState("Create");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (jwtToken) {
      setBtnMsg("Authenticated");
      setTimeout(() => setBtnMsg("Create"), 1000);
    } else setBtnMsg("Authenticating...");
  }, [jwtToken]);

  async function handleSubmit(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    if (!name || !pwd) return;

    setCreating(true);
    setBtnMsg("Creating...");
    try {
      const response = await fetch(
        "https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run/create",
        {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${jwtToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name,
            password: pwd,
          }),
        }
      );

      if (response.status === 409) {
        const json = await response.json();
        setBtnMsg(json.message);
        return;
      }

      if (!response.ok) {
        setBtnMsg("Failed to create");
        return;
      }

      const json = await response.json();
      setBtnMsg(json.message);
    } catch (e) {
      console.error(e);
      setBtnMsg("Error when creating");
    } finally {
      setName("");
      setPwd("");
      setCreating(false);
      setTimeout(() => setBtnMsg("Create"), 1500);
    }
  }

  return (
    <form className="create-form">
      <h3>Create Rooms</h3>
      <label htmlFor="name">
        Name:
        <input
          type="text"
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        ></input>
      </label>
      <label htmlFor="pwd">
        Password for Room:
        <input
          type="text"
          id="pwd"
          name="pwd"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
        ></input>
      </label>
      <button disabled={creating} className="delete-duplicate" type="submit" onClick={handleSubmit}>
        {btnMsg}
      </button>
    </form>
  );
}

function DropDuplicate({ OSSClient, jwtToken }: { OSSClient: OSS; jwtToken: string }) {
  const [dup, setDup] = useState<{ [key: string]: FileObj[] }>({});
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [detectBtnMsg, setDetectBtnMsg] = useState("Detect Duplicates");
  const [btnMsg, setBtnMsg] = useState("Delete");
  const [detecting, setDetecting] = useState(false);

  const handleCheck = (name: string) => {
    setSelectedNames((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  async function detectDuplicates() {
    try {
      setDetectBtnMsg("Detecting");
      setDetecting(true);

      const now = new Date();
      now.setDate(now.getDate() + 1);
      const fileList: FileObj[] = [];
      for (let i = 0; i < 7; i++) {
        now.setDate(now.getDate() - 1);
        const prefix = `files/${padDate(now)}/`;
        const list = (await OSSClient.list({
          prefix: prefix,
        })) as { objects: FileObj[] };
        const final = list.objects
          .filter((f) => f.name !== prefix && f.storageClass === "Standard")
          .map((f) => ({
            name: f.name.replace("files/", ""),
            url: f.url,
            storageClass: f.storageClass,
            size: f.size,
          }));
        fileList.push(...final);
      }

      const duplicateMap = new Map<string, FileObj[]>();
      for (const file of fileList) {
        const fileName = file.name
          .slice(11)
          .split("/")
          .pop()!
          .replace(/^~\$/, "")
          .replace(/(?:_\d+)?\.[^\.]+$/, "");
        if (!duplicateMap.has(fileName)) {
          duplicateMap.set(fileName, [file]);
        } else {
          const old = duplicateMap.get(fileName)!;
          duplicateMap.set(fileName, [...old, file]);
        }
      }

      const duplicated: { [key: string]: FileObj[] } = {};
      for (const [name, list] of duplicateMap) {
        if (list.length > 1) {
          duplicated[name] = list;
        }
      }

      setDup(duplicated);
      setDetectBtnMsg("Detect Duplicates");
    } catch (e) {
      console.error("Error when getting duplicates: ", e);
      setDetectBtnMsg("Error");
      setTimeout(() => setDetectBtnMsg("Detect Duplicates"), 3000);
    } finally {
      setDetecting(false);
    }
  }

  async function deleteDuplicates() {
    if (selectedNames.length === 0) return;
    if (!window.confirm("Sure to delete?")) return;

    setBtnMsg("Deleting");
    setSelectedNames([]);
    try {
      const files = selectedNames.map((f) => `files/${f}`);
      await OSSClient!.deleteMulti(files);
      setBtnMsg("Deleted");
      fetch("https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run/oper", {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          oper: "delete",
          files: files.map((f) => f.slice(6)),
          date: "[MULTI]",
        }),
      });
    } catch (e) {
      window.alert(`Failed to delete: ${e}`);
    } finally {
      detectDuplicates();
      setTimeout(() => {
        setBtnMsg("Delete");
      }, 1000);
    }
  }

  return (
    <form className="duplicate-form">
      <div className="dup-header">
        <h3>Drop Duplicates</h3>
        <button type="button" onClick={detectDuplicates} disabled={detecting}>
          {detectBtnMsg}
        </button>
        {Object.keys(dup).length > 0 && (
          <button type="button" onClick={deleteDuplicates} disabled={btnMsg === "Deleting"}>
            {btnMsg}
          </button>
        )}
      </div>

      {Object.keys(dup).length > 0 && (
        <>
          <hr />
          {Object.entries(dup).map(([key, list]) => {
            return (
              <div key={key}>
                <div className="duplicate-name">{key}</div>
                <div id="files">
                  {list.map((f) => (
                    <div className="options" key={f.url}>
                      <input
                        type="checkbox"
                        id={"dup-" + f.url}
                        className="checkbox-input"
                        checked={selectedNames.includes(f.name)}
                        onChange={() => handleCheck(f.name)}
                      ></input>
                      <label htmlFor={"dup-" + f.url} className="checkbox-label">
                        {f.name.slice(11)}
                        <br />
                        <div className="dup-date">{f.name.slice(0, 10)}</div>
                      </label>
                    </div>
                  ))}
                </div>
                <hr />
              </div>
            );
          })}
        </>
      )}
    </form>
  );
}

export default function Admin() {
  const [jwtToken, setJwtToken] = useState<any>(null);
  const [OSSClient, setOSSCLIent] = useState<any>(null);
  const [showTraffic, setShowTraffic] = useState(false);

  useEffect(() => {
    const getAuth = async () => {
      const response = await fetch("/auth/");
      if (response.status === 500 || !response.ok) {
        console.error("Error when authenticating");
        return;
      }
      const tokens = await response.json();
      const { accessKeyId, accessKeySecret, stsToken, bucket, jwtToken } = tokens;
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
            const response = await fetch("/auth/");
            const { accessKeyId, accessKeySecret, stsToken } = await response.json();
            return { accessKeyId, accessKeySecret, stsToken };
          } catch {
            throw new Error("Failed to get STS");
          }
        },
        refreshSTSTokenInterval: 3600000,
      });
      setOSSCLIent(client);
      setJwtToken(jwtToken);
    };
    getAuth();
  }, []);

  const Traffic = dynamic(() => import("./Traffic"), {
    loading: () => <p>Traffic is Loading...</p>,
  });

  return (
    <>
      {!showTraffic ? (
        <div className="container">
          <DeleteForm OSSClient={OSSClient} jwtToken={jwtToken} />
          <CreateRoom jwtToken={jwtToken} />
          <DropDuplicate OSSClient={OSSClient} jwtToken={jwtToken} />
          <div style={{ alignSelf: "flex-end" }}>
            <button type="button" onClick={() => setShowTraffic(true)}>
              Show Traffic
            </button>
          </div>
        </div>
      ) : (
        <Traffic client={OSSClient} setShowTraffic={setShowTraffic} />
      )}
    </>
  );
}
