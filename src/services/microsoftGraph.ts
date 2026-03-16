import { msalInstance, loginRequest } from "./msalConfig";

export class MicrosoftGraphService {
    private async getAccessToken() {
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length === 0) {
            throw new Error("No active account found. Please login.");
        }

        const request = {
            ...loginRequest,
            account: accounts[0]
        };

        try {
            const response = await msalInstance.acquireTokenSilent(request);
            return response.accessToken;
        } catch (error) {
            const response = await msalInstance.acquireTokenPopup(request);
            return response.accessToken;
        }
    }

    async uploadFile(fileName: string, content: string, folderPath: string = "RubricMaker") {
        const token = await this.getAccessToken();
        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${folderPath}/${fileName}:/content`;

        const response = await fetch(endpoint, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: content
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error.message || "Failed to upload file to OneDrive");
        }

        return await response.json();
    }

    async downloadFile(fileName: string, folderPath: string = "RubricMaker") {
        const token = await this.getAccessToken();
        const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${folderPath}/${fileName}:/content`;

        const response = await fetch(endpoint, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (response.status === 404) {
            return null;
        }

        if (!response.ok) {
            throw new Error("Failed to download file from OneDrive");
        }

        return await response.text();
    }

    async getUserProfile() {
        const token = await this.getAccessToken();
        const response = await fetch("https://graph.microsoft.com/v1.0/me", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        return await response.json();
    }
}

export const graphService = new MicrosoftGraphService();
