import { Configuration, PublicClientApplication, LogLevel } from "@azure/msal-browser";

export const msalConfig: Configuration = {
    auth: {
        clientId: "YOUR_CLIENT_ID_HERE", // User will need to provide this or I'll use a placeholder
        authority: "https://login.microsoftonline.com/common",
        redirectUri: window.location.origin,
    },
    cache: {
        cacheLocation: "localStorage",
    },
    system: {
        loggerOptions: {
            loggerCallback: (level, message, containsPii) => {
                if (containsPii) return;
                switch (level) {
                    case LogLevel.Error:
                        console.error(message);
                        return;
                    case LogLevel.Info:
                        console.info(message);
                        return;
                    case LogLevel.Verbose:
                        console.debug(message);
                        return;
                    case LogLevel.Warning:
                        console.warn(message);
                        return;
                    default:
                        return;
                }
            }
        }
    }
};

export const loginRequest = {
    scopes: ["User.Read", "Files.ReadWrite.All", "Sites.ReadWrite.All"]
};

export const msalInstance = new PublicClientApplication(msalConfig);
// Initializing is required in msal-browser 3.x
msalInstance.initialize();
