"use client";
import { useState, useEffect } from "react";
import "./styles.css";

export default function CreateRoom() {
  const [name, setName] = useState("");
  const [pwd, setPwd] = useState("");
  const [btnMsg, setBtnMsg] = useState("Create");
  const [jwtToken, setJwtToken] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  // Get jwt token and client
  useEffect(() => {
    const getAuth = async () => {
      const jwtRes = await fetch("/auth");
      setBtnMsg("Authenticating...");
      if (jwtRes.status === 500 || !jwtRes.ok) {
        setBtnMsg("Failed to authenticate");
        throw new Error("Failed to get JWT");
      }
      const { jwtToken } = await jwtRes.json();
      setJwtToken(jwtToken);
      setBtnMsg("Authenticated");
      setTimeout(() => setBtnMsg("Create"), 1000);
    };
    getAuth();
  }, []);

  async function handleSubmit(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
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
      setBtnMsg(`Room ${json.roomName} created`);
    } catch (e) {
      console.error(e);
      setBtnMsg("Error when creating");
    } finally {
      setCreating(false);
      setTimeout(() => setBtnMsg("Create"), 1500);
    }
  }

  return (
    <form className="create-form">
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
      <button disabled={creating} type="submit" onClick={handleSubmit}>
        {btnMsg}
      </button>
    </form>
  );
}
