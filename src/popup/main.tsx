import { createRoot } from "react-dom/client";
import { Popup } from "./Popup";
import "./index.css";

const container = document.getElementById("root");
if (container) createRoot(container).render(<Popup />);
