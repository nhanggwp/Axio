import { loadConfig } from "../config";
import { createApplication } from "../app";
const { db, auth } = await createApplication(loadConfig());
console.log("Đã áp dụng lược đồ Better Auth và migration tài liệu.");
await (await auth.$context).checkSchema?.();
db.close();
