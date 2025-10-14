import { name as APP_NAME, version as APP_VERSION } from "../../package.json";
const ENVIRONMENT = process.env.NODE_ENV ?? "";

export const LOGGED_USER_INFO_KEY =
  APP_NAME + " " + APP_VERSION + " " + ENVIRONMENT + " " + "loggedUserInfoKey";
export const JWT_KEY =
  APP_NAME + " " + APP_VERSION + " " + ENVIRONMENT + " " + "JWTKey";
export const REFRESH_JWT_KEY =
  APP_NAME + " " + APP_VERSION + " " + ENVIRONMENT + " " + "RefreshJWTKey";
