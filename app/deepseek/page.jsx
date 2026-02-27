"use client";
import { useState, useEffect, useRef } from "react";
import AIResponse from "./AIResponse";
import "./App.css";

export default function Interface() {
  const [userInput, setUserInput] = useState("");
  const [stream, setStream] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [jwtToken, setJwtToken] = useState("");
  const textareaRef = useRef(null);
  const messagesRef = useRef(messages);

  // Get jwt token
  useEffect(() => {
    const getClient = async () => {
      const response = await fetch("/auth");
      if (response.status === 500 || !response.ok) throw new Error("Failed to get JWT");
      const { jwtToken } = await response.json();
      setJwtToken(jwtToken);
    };
    getClient();
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 350) + "px";
    }
  }, [userInput]);

  useEffect(() => {
    switch (messages.length) {
      case 20: // 10 chats
        alert("Notice: This chatbot requires the developer to pay. Please limit your use.");
        break;
      case 30: // 15 chats
        alert("Please limit your use! The page will reload after another 5 messages.");
        break;
      case 40: // 20chats
        window.alert("The page will reload in 10 seconds.");
        setTimeout(() => window.location.reload(), 10000);
        break;
      default:
        break;
    }
  }, [messages]);
  const sendMessage = async () => {
    const userMessage = userInput.trim();
    if (!userMessage || isLoading) return;

    const newMessages = [...messages, { role: "user", content: userMessage }];
    setMessages(newMessages);
    setUserInput("");
    setIsLoading(true);

    try {
      const response = await fetch("https://oss-zipper-xvgsgppblx.cn-shanghai.fcapp.run/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Authorization": `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (
        response.redirected ||
        (response.url && response.url.endsWith("/fail")) ||
        (response.headers.get("content-type") || "").includes("text/html")
      ) {
        window.location.href = "/fail";
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let completion = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        completion += chunk;
        setStream(completion);
      }
      console.log(completion);
      setMessages((prev) => [...prev, { role: "assistant", content: completion }]);
      setStream("");
      setIsLoading(false);
    } catch (e) {
      console.error(e);
      alert(e.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="messages-container">
        {messages
          .filter((msg) => msg.role !== "system")
          .map((msg, idx) => (
            <div key={idx} className={`messages ${msg.role}-messages`}>
              {msg.role === "user" ? (
                <div>{msg.content}</div>
              ) : (
                <AIResponse HTMLcontent={msg.content} />
              )}
            </div>
          ))}
        {stream && (
          <div className="messages assistant-messages streaming">
            <AIResponse HTMLcontent={stream} isStreaming={true} />
          </div>
        )}
      </div>
      <div className="input-area">
        <textarea
          ref={textareaRef}
          id="user-input"
          className="user-input"
          placeholder="Type in messages..."
          value={userInput}
          onChange={(e) => {
            setUserInput(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
        />
        <div className="options-area">
          <button className="send-button" type="button" onClick={sendMessage} disabled={isLoading}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M8.3125 0.981587C8.66767 1.0545 8.97902 1.20558 9.2627 1.43374C9.48724 1.61438 9.73029 1.85933 9.97949 2.10854L14.707 6.83608L13.293 8.25014L9 3.95717V15.0431H7V3.95717L2.70703 8.25014L1.29297 6.83608L6.02051 2.10854C6.26971 1.85933 6.51277 1.61438 6.7373 1.43374C6.97662 1.24126 7.28445 1.04542 7.6875 0.981587C7.8973 0.94841 8.1031 0.956564 8.3125 0.981587Z"
                fill="#fff"
              ></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
