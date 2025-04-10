import { config } from 'dotenv';
import readline from 'readline/promises';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

config();

let tools = [];
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const mcpClient = new Client({
    name: "example-client",
    version: "1.0.0",
});

const chatHistory = [];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

mcpClient.connect(new SSEClientTransport(new URL("http://localhost:3001/sse")))
    .then(async () => {
        console.log("✅ Connected to MCP server");

        tools = (await mcpClient.listTools()).tools.map(tool => {
            return {
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: tool.inputSchema.type,
                    properties: tool.inputSchema.properties,
                    required: tool.inputSchema.required
                }
            };
        });

        chatLoop();
    })
    .catch(err => {
        console.error("❌ Failed to connect to MCP server:", err.message);
    });

async function chatLoop(toolCall) {
    try {
        if (toolCall) {
            console.log("⚙️ Calling tool:", toolCall.name);

            chatHistory.push({
                role: "model",
                parts: [{ text: `Calling tool ${toolCall.name}` }]
            });

            const toolResult = await mcpClient.callTool({
                name: toolCall.name,
                arguments: toolCall.args
            });

            chatHistory.push({
                role: "user",
                parts: [{ text: "Tool result: " + toolResult.content[0].text }]
            });

        } else {
            const question = await rl.question('🧑 You: ');
            chatHistory.push({
                role: "user",
                parts: [{ text: question }]
            });
        }


        const model = ai.getGenerativeModel({ model: "gemini-1.5-pro" });


        const result = await model.generateContent({
            contents: chatHistory,
            tools: [
                {
                    functionDeclarations: tools
                }
            ]
        });

        const parts = result.response.candidates[0].content.parts;
        const functionCall = parts.find(p => p.functionCall)?.functionCall;
        const textPart = parts.find(p => p.text)?.text;

        if (functionCall) {
            return chatLoop(functionCall);
        }

        if (textPart) {
            chatHistory.push({
                role: "model",
                parts: [{ text: textPart }]
            });

            console.log(`🤖 AI: ${textPart}`);
        }

    } catch (error) {
        console.error("❌ Error from Gemini API:", error.message);
    }

    // Keep chatting even after error
    chatLoop();
}
