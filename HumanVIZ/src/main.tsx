import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "../backend/static/css/theme.css";
import "./index.scss";
import "@mantine/core/styles.css";

import { MantineProvider, createTheme } from "@mantine/core";

const theme = createTheme({
  primaryColor: "dark",
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme}>
    <App />
  </MantineProvider>
);
