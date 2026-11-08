import { loadConfig } from "./config";
import { createApplication } from "./app";
const config = loadConfig();
const { app } = await createApplication(config);
app.listen(config.port, config.host, () => {
  console.log(`Axio API: http://${config.host}:${config.port}`);
  console.log(`Mở Axio: ${config.origin}`);
});
