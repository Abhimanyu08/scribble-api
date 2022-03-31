import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import router from "./routes/roomRouter.js";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app, (req, res) => {
  res.send("hello");
});
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

app.use(cors());
app.use(bodyParser.json());
app.use("/room", router);

// io.on("connection", (socket) => {
//     console.log(`connection opened in ${socket.id}`);
//     socket.on("addParticipant", (room_id, user) => {

//     })
// });

httpServer.listen(5000);

export default io;
