"use client";
import { useState } from "react";
import { testSuper } from "./test-super";
import dynamic from "next/dynamic";
import "./styles.css";

const CreateRoom = dynamic(() => import("./Admin"), {
  loading: () => <p>Loading...</p>,
});

export default function RequirePassword() {
  const [input, setInput] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    setIsLoading(true);
    const isValid = await testSuper(input);
    if (isValid) setIsAuthorized(true);
    else {
      setInput("");
      alert("Invalid password");
    }
    setIsLoading(false);
  }

  if (isAuthorized) return <CreateRoom />;
  else
    return (
      <form className="pwd-form">
        <label htmlFor="pwd" style={{ fontWeight: "bold", padding: "0", fontSize: "16px" }}>
          Input password:{" "}
        </label>
        <input
          type="password"
          id="pwd"
          name="pwd"
          minLength={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          disabled={isLoading}
          type="submit"
          style={{ marginLeft: "3px" }}
          onClick={handleSubmit}
        >
          {isLoading ? "Checking..." : "Submit"}
        </button>
      </form>
    );
}
