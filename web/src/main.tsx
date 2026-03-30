import { render } from "preact";
import "@mesh2cad/mesh-workspace-viewer/styles.css";
import App from "./app";
import "./index.css";

render(<App />, document.getElementById("app")!);
