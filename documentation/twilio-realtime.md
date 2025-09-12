With the general availability of OpenAI’s Realtime API, Twilio’s collaboration with OpenAI now empowers over 349,000 customers and 10 million developers to create next-generation voice AI experiences. Today, this integration gets even more powerful: the Realtime API now supports SIP, making it straightforward to connect Twilio SIP Trunking, PBX systems, carriers, and desk phones – enabling low-latency, AI-powered support agents, conversational IVRs, and custom call flows

In this guide, I’ll walk through connecting Twilio’s Elastic SIP Trunking to OpenAI’s Realtime API using a Node.js/TypeScript server to respond to webhooks, and build an AI support agent that answers inbound calls, understands customer issues, and responds instantly.

Prerequisites
Before you can create a SIP Trunk connection to OpenAI’s Realtime API, you’ll need to make sure you have a few accounts in place and put a few things in place.

Twilio Account (If you don’t have one yet, you can sign up for a free trial here)
A Twilio number with Voice capabilities. Here are instructions to purchase a phone number
An OpenAI account and an OpenAI API Key. You can sign up here
OpenAI Realtime API access. Check here for more information
Node.js/Typescript (I used version 22.15.0 – you can download it from here)
A tunnelling solution like Ngrok (You can download ngrok here)
This tutorial shows you how to build the server to respond to the OpenAI webhook in TypeScript, however, you can build in your language of choice. The principle is the same across most languages.

Build the app
In the rest of this tutorial, I’ll help you build a complete SIP-to-AI call flow. You’ll start by setting up an OpenAI webhook that triggers on the realtime.call.incoming event type, allowing your app to respond the moment a call arrives. We’ll then configure Twilio Elastic SIP Trunking to connect directly to OpenAI’s Realtime API. Finally, you’ll create a Node.js/TypeScript script that handles the incoming call, instructs OpenAI on how to manage the conversation, and returns the appropriate real-time responses.

There is a repo for this build which you can find here.
Set up a static domain with Ngrok
To set up static domains in ngrok, you’ll need a paid ngrok plan since static domains aren’t available on the free tier. After reserving a domain in the ngrok dashboard under Reserved Domains (e.g., myapp.ngrok.app), you can start a tunnel on the command line by specifying it directly with either the --domain or --url flag, such as:

Bash

Copy code
ngrok http 8000 --domain=myapp.ngrok.app
This ensures your application is always available at the same address. Without reserving a domain, ngrok assigns a randomly generated subdomain each time you start a tunnel (e.g., a1b2c3d4.ngrok.app), so your public URL changes on every restart—making it unreliable for webhooks or any service that expects a consistent callback URL.

If you choose to use a random URL, you can start ngrok with ngrok http 8000. Be sure you change the below webhook URL if you do ever restart your ngrok service while testing.

Get started with SIP and OpenAI Realtime

First we will define a webhook in your project that will fire on a realtime.call.incoming event type. We’ll do this work inside your OpenAI Console.

Go to https://platform.openai.com/settings/.
Click Webhooks in the sidebar.
Select the Create a webhook button in the top right
Give it a name
The URL will be the tunneling url that you define with a tool like Ngrok
Set the event type to realtime.call.incoming
Copy the Webhook secret for later
Okay, great! Now it’s time to work on the Twilio side.

Configure Twilio SIP Trunking
Now I am going to outline how to set up a SIP Trunk and then configure it to point at the OpenAI SIP Origination URI.

If you are new to Twilio, start with Step 1. If you’ve already got some Twilio experience and a voice-capable phone number you know you’d like to use, you can skip to Step 2.

Step 1: Buy a Phone Number in Twilio
If you don’t yet have a number, start by buying a phone number you’d like to use.

Go to Twilio Console – Buy Numbers.
Search for a number with Voice capabilities.
Click Buy and confirm your purchase.
Screen showing options to purchase a phone number with capabilities like voice, SMS, MMS, and fax.
Step 2: Create a SIP Trunk
To forward calls to OpenAI via SIP, you’ll need to create a SIP Trunk.

Go to Twilio Console – SIP Trunks.
Click + to create a new SIP trunk.
Name it something like OpenAI Routing.
Okay, perfect – now you can add the origination URL. We’ll walk through that next.

Step 3: Add the Origination URI
In the SIP Trunk menu, go to Origination.
Click Add Origination URI.
Set the URI to: sip: project-id@sip.api.openai.com;transport=tls, replacingproject-id with your actual OpenAI Project ID (you can find this in the URL when viewing your project in the OpenAI platform). Or you can find this by going to Settings then General on the left hand side, the page displays the project id.
Leave priority/weight as default unless you have multiple URIs.
Next you can connect the phone number you purchased to the SIP Trunk.

Step 4: Connect the Phone Number to the SIP Trunk
In SIP Trunk settings, go to Phone Numbers.
Click Add Phone Number.
Select the number you purchased in Step 1 or otherwise want to use to talk to AI.
Incoming calls to your Twilio number will now be routed to:

sip: project-id@sip.api.openai.com;transport=tls

… and you’re now ready to dive into some code! Let’s get this party started.

Handle the incoming call with TypeScript
This section deals with setting up what happens to the call when it is initiated. This logic layer is written in Typescript , and I’ll outline the steps involved to recreate the script.

If you don’t want to walk through building the code, you can find the repo on Github here.
Set up the code base
Open up a terminal and run the following commands:

Bash

Copy code
mkdir openai-realtime-sip && cd openai-realtime-sip
npm init -y
npm install body-parser dotenv express openai ws
npm install --save-devs @types/express @types/node @types/ws tsx typescript
mkdir src
touch src/index.ts
mkdir dist
touch .env
touch tsconfig.json
This sets up the Node/TypeScript environment, sets up the production install packages and development environment packages, then creates a src directory and a dist build directory, an .env file to hold all your keys, and a tsconfig.json file to tell the tsx compiler what to do when compiling typescript.

Next, let’s set up some Environment variables.

Set up Environment Variables
Open up the .env file in your favorite text editor or IDE. Then, enter your OpenAI project API Key and the OpenAI Webhook secret which you copied earlier when setting up the webhook. The port can be set to 8000, this tells the server where to listen.

Text

Copy code
OPENAI_API_KEY=sk-proj-...
OPENAI_WEBHOOK_SECRET=whsec...
PORT=8000
Set up tsconfig.json
Now you’ll need to edit the tsconfig.json file.

Json

Copy code
{
 "compilerOptions": {
   "target": "ES2020",
   "module": "ESNext",
   "moduleResolution": "Node",
   "strict": true,
   "esModuleInterop": true,
   "forceConsistentCasingInFileNames": true,
   "resolveJsonModule": true,
   "skipLibCheck": true,
   "outDir": "dist"
 },
 "include": ["src"]
}
Take the above and enter it into the tsconfig.json file. This tells the tsx compiler various options, for example what flavor of JavaScript/TypeScript we are working with, where your TypeScript files exist, and where the build files should be compiled to.

Set up package.json
Json

Copy code
"scripts": {
   "test": "echo \"Error: no test specified\" && exit 1",
   "dev": "tsx watch src/index.ts",
   "build": "tsc -p .",
   "start": "node dist/index.js"
 }
Next, open the package.json file and ensure the above is defined.

For this demo, I have no test units specified (you should add unit tests if you bring an application to prod, however!) so you can keep it as is or remove that line.

The dev command tells the tsx compiler where to watch for code (this has the nice upside of updating when you make changes). build tells the tsx compiler where to put the compiled JavaScript files, and start tells node where to find the compiled index javascript file.

Write the server code for the webhook
In this next section, I’ll walk you through the code you’ll need to connect the Realtime API SIP Connector with Twilio.

Lay the groundwork for the server
I’ll help you write a basic Express server that can receive OpenAI webhooks, verify them, and then talk back to the Realtime API. Here’s how the code starts:

JavaScript

Copy code
import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import WebSocket from "ws";
import OpenAI from "openai";
import "dotenv/config";

const PORT = Number(process.env.PORT ?? 8000);
const WEBHOOK_SECRET = process.env.OPENAI_WEBHOOK_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!WEBHOOK_SECRET || !OPENAI_API_KEY) {
 console.error("Missing OPENAI_WEBHOOK_SECRET or OPENAI_API_KEY in .env");
 process.exit(1);
}

const app = express();
app.use(bodyParser.raw({ type: "*/*" }));

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

const callAccept = {
   instructions: "You are a support agent. Speak in English unless the user requests a different language",
   type: “realtime”,
   model: "gpt-realtime",
  
  audio: {
      output: { voice: “alloy” },
  } 

} as const;

const WELCOME_GREETING=”Thank you for calling, how can I help?”;

const responseCreate = {
 type: "response.create",
 response: {
   instructions: `Say to the user: ${WELCOME_GREETING}`,
 },
} as const;

const RealtimeIncomingCall = "realtime.call.incoming" as const;
Here, we pull our port, webhook secret, and API key from the .env file. The Express app is configured with a raw body parser because OpenAI’s signature verification needs the exact request bytes, untouched by JSON parsing.

Then, spin up a single OpenAI SDK client using your API key so we can both unwrap incoming webhooks and send API requests. Finally, define two small payloads to reuse:

callAccept, which tells OpenAI how to set up the voice session (support agent instructions, chosen model, “alloy” voice, and “realtime” type), and
responseCreate, which is the first thing we want the AI to say to a caller—essentially our “thanks for calling” greeting, ready to fire as soon as the call is accepted.
Finally, we create a RealtimeIncomingCall constant which we will use as a convenient way to determine the incoming event type.

Create a websocketTask function
Now we create a websocketTask function which creates and manages a WebSocket connection to the OpenAI Realtime API using the provided uri.

JavaScript

Copy code
const websocketTask = async (uri: string): Promise<void> => {

 const ws = new WebSocket(uri, {
   headers: {
     Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
     origin: "https://api.openai.com",
   },
 });

 ws.on("open", () => {
   console.log(`WS OPEN ${uri}`);
   ws.send(JSON.stringify(responseCreate));
 });

 ws.on("message", (data) => {
   const text = typeof data === "string" ? data : data.toString("utf8");
   // console.log("Received from WebSocket:", text);
 });

 ws.on("error", (e) => {
   console.error("WebSocket error:", JSON.stringify(e));
 });

 ws.on("close", (code, reason) => {
   console.log("WebSocket closed:", code, reason?.toString?.());
 });
}
This code authenticates the connection with the OpenAPI key and sets the origin header to identify the client.

When the connection opens, the code logs the event and sends the responseCreate payload to instruct the model on what to say. The server then listens for incoming messages, converting them to strings for processing. It also logs any errors that occur during the connection, and records when the connection closes along with the closure code and reason.

This setup provides a persistent channel for sending and receiving real-time events for the call.

Establish a connection to the SIP URL
Next, a function attempts to establish a WebSocket connection to the given sipWssUrl and will retry if the connection fails.

JavaScript

Copy code
const connectWithDelay = async (sipWssUrl: string, delay: number = 1000): Promise<void> => {
 try {
   setTimeout(async () => await webSocketTask(sipWssUrl), delay);
 } catch (e) {
   console.error(`Error connecting web socket ${e}`);
 }
}
If an error occurs—such as a failed upgrade or a 404/1006 close code—it catches and logs the exception. To improve reliability, it uses a simple delay mechanism to pause connecting to the web socket if needed. This ensures the connection process is resilient to transient errors without creating excessive delays.

Listen for POST requests from OpenAI
Finally, this Express route listens for incoming POST requests from OpenAI’s webhook system, verifies their authenticity, and handles realtime call events.

Apex

Copy code
app.post("/", async (req: Request, res: Response) => {

 try {
   const event = await client.webhooks.unwrap(
     req.body.toString("utf8"),
     req.headers as Record<string, string>,
     WEBHOOK_SECRET
   );

   const type = (event as any)?.type;

   if (type === RealtimeIncomingCall) {
     const callId: string = (event as any)?.data?.call_id;

     // Accept the Call
     const resp = await fetch(
       `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/accept`,
       {
         method: "POST",
         headers: {
           Authorization: `Bearer ${OPENAI_API_KEY}`,
           "Content-Type": "application/json",
         },
         body: JSON.stringify(callAccept),
       }
     );

     if (!resp.ok) {
       const text = await resp.text().catch(() => "");
       console.error("ACCEPT failed:", resp.status, resp.statusText, text);
       return res.status(500).send("Accept failed");
     }

     // Connect the web socket after a short delay
     const wssUrl = `wss://api.openai.com/v1/realtime?call_id=${callId}`;
     await connectWithDelay(wssUrl), 0);

     // Acknowledge the webhook
     res.set("Authorization", `Bearer ${OPENAI_API_KEY}`);
     return res.sendStatus(200);
   }

   return res.sendStatus(200);

 } catch (e: any) {
   const msg = String(e?.message ?? "");
   if (e?.name === "InvalidWebhookSignatureError" || msg.toLowerCase().includes("invalid signature")) {
     return res.status(400).send("Invalid signature");
   }
   return res.status(500).send("Server error");
 }
});

app.listen(PORT, () => {
 console.log(`Listening on http://localhost:${PORT}`);
});

When a request arrives, it first unwraps the raw body and headers using the webhook secret, ensuring the payload is signed by OpenAI. If the event type indicates a realtime incoming call, it extracts the call_id and immediately sends a POST request to OpenAI’s /accept endpoint with the callAccept payload—this tells OpenAI to start the session using our chosen model, instructions, and voice.

If the accept request succeeds, it calls the wss_url and, after a short delay, calls connectWithDelay to establish the WebSocket connection for real-time interaction. The route then sets an Authorization header in the response to satisfy OpenAI’s requirements and returns a 200 OK to acknowledge the webhook. If the event type is something else, it simply responds with 200 OK, while errors – like invalid signatures – are caught and returned with appropriate HTTP status codes. The server logs when it’s ready to accept incoming webhooks.

There was a lot there, but you’re in the home stretch! Next, we’ll look at running the server and wiring it all up.

Running, testing, and troubleshooting
Excellent work! If you’ve followed all of the steps successfully, you’re about to be able to call an AI Agent and experience the magic. Just a few more steps, now!

Let’s start with ngrok
Assuming you have ngrok installed and an account set up, you can create a tunnel to your local machine:

Bash

Copy code
ngrok http 8000 --url <ngrok domain endpoint>
The above command tells ngrok to listen on port 8000 and (optionally) set the domain name to the one specified in --url. If you remember, when setting up the webhook this was the domain that was specified as the endpoint. If you have not set up static domains in Ngrok, you will be assigned a random domain name - this will make this whole process a little more difficult since, you would have to update the webhook each time you restart Ngrok.

Next, you can start the server with:

npm run dev

If all went well you should see something like this:

Bash

Copy code
> openai-sip-trunking@1.0.0 dev
> tsx watch src/index.ts

Listening on http://localhost:8000
Set the voice webhook and call the AI!
Now you should be ready to call the number that you obtained and configured earlier, and speak directly to OpenAI’s Realtime model. 

Ask it anything – seriously, try anything! – I asked the model to speak to me in French while I spoke to it in English - fantastique!

Common gotcha: callAccept
When I first built this app, I spent a long time wondering why I was getting logging back from my webhook but not hearing anything on the phone line. This was because I had forgotten to send back a 200 OK in the form of the callAccept JSON packet that had been created earlier. 

When the endpoint is invoked, the first thing you have to do is respond and say you are accepting the call:

 

JavaScript

Copy code
const resp = await fetch(
       `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/accept`,
       {
         method: "POST",
         headers: {
           Authorization: `Bearer ${OPENAI_API_KEY}`,
           "Content-Type": "application/json",
         },
         body: JSON.stringify(callAccept),
       }
     );
Conclusion
Now that everything is connected, you’ve got a complete path from the moment someone calls your number to having a live, natural conversation powered by OpenAI’s Realtime API and Twilio’s Elastic SIP Trunking. 

When a call comes in, your webhook tells OpenAI you’re ready to talk. That acceptance step is key—there you set the tone and the theme for the whole conversation by choosing the voice, personality, and role you need. Each part plays its role: the webhook opens the door, the accept step invites the caller in, and the WebSocket keeps the conversation going without delay. 

With a Twilio and OpenAI foundation in place, you can start shaping your customer experience however you like—whether that’s adding smarter responses, pulling in live data, or crafting a voice that truly reflects your brand. (Or, next, see how to warm transfer to a human agent with Twilio's Programmable SIP). This new era is something else: it isn’t just picking up a phone; it’s creating a whole new kind of conversation.

Next, my colleague Margot will show you how to perform a warm transfer from an AI Agent to a human with the OpenAI Realtime SIP Connector and Twilio Programmable SIP.

