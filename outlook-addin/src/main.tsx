import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

/// <reference path="./office.d.ts" />

function render() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// Office.js initializes asynchronously
if (typeof Office !== "undefined") {
  Office.onReady(() => render());
} else {
  // Dev mode without Office context
  render();
}
