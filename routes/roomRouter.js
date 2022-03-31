import pkg from "express";
import bp from "body-parser";
import { join, dirname, resolve } from "path";
import { Low, JSONFile } from "lowdb";
import { fileURLToPath } from "url";
import cors from "cors";
import io from "../server.js";
import fs from "fs";

const dbDirname = dirname(fileURLToPath(import.meta.url));
// const wordsFile = resolve('../words.json');
const express = pkg;
const bodyParser = bp;

const router = express.Router();
const file = join(resolve(`${dbDirname}/..`), "db.json");
const adapter = new JSONFile(file);
const db = new Low(adapter);
let wordsList = [];
try {
  const data = fs.readFileSync(resolve("../api/words.json"));
  wordsList = JSON.parse(data).english;
} catch (e) {
  console.error(e);
}

function getRandDomWords(wordList) {
  let words = [];
  let ridx;
  for (let i = 0; i < 3; i++) {
    ridx = Math.floor(Math.random() * wordList.length);
    words.push(wordList[ridx]);
  }

  return words;
}

const main = async () => {
  await db.read();
};

main()
  .then(() => {
    db.data ||= {};
    //-----------------Socket stuff----------------------------//
    // io.of(/^\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89aAbB][a-f0-9]{3}-[a-f0-9]{12}/i).on("connection", (socket) => {

    //     //
    //     console.log(`connection established to namespace ${socket.nsp}`);

    // })
    io.on("connection", (socket) => {
      socket.on("addParticipant", async (roomId, user) => {
        socket.join(roomId);
        if (db.data[roomId].active.indexOf(user) === -1) {
          db.data[roomId].active.push(user);
          // db.data[roomId].scores[user] = 0;
          await db.write();

          // io.to(roomId).emit('newParticipant', [...db.data[roomId].active]);
        }
      });

      socket.on("getParticipants", async (roomId) => {
        io.to(roomId).emit("newParticipant", [...db.data[roomId].active]);
      });

      socket.on("info", async (roomId, info) => {
        db.data[roomId] = Object.assign(db.data[roomId], info);
        // db.data[roomId].currentDrawer = currentDrawer;
        await db.write();
        let { active, rounds, time } = db.data[roomId];
        io.to(roomId).emit("gameStarted", active, rounds, time);
      });

      socket.on("message", (roomId, author, message) => {
        io.to(roomId).emit("message", author, message);
      });

      socket.on("event", (roomId, event) => {
        socket.broadcast.to(roomId).emit("event", event);
      });

      socket.on("color", (roomId, color) => {
        socket.broadcast.to(roomId).emit("color", color);
      });

      socket.on("tool", (roomId, tool) => {
        socket.broadcast.to(roomId).emit("tool", tool);
      });

      socket.on("size", (roomId, size) => {
        socket.broadcast.to(roomId).emit("size", size);
      });

      // socket.on("destroy", async (roomId) => {
      //   let data = db.data;
      //   delete data[roomId];
      //   db.data = data;
      //   console.log("destoryed");
      //   await db.write();
      // });
      socket.on("disconnecting", async () => {
        let rooms = Array.from(socket.rooms);
        let data = db.data;
        delete data[rooms[1]];
        db.data = data;
        await db.write();
      });

      socket.on("wordChoice", (roomId, word) => {
        io.to(roomId).emit("word", word);
      });

      socket.on("blank", (roomId, words) => {
        socket.broadcast.to(roomId).emit("blank", words);
      });

      socket.on("guessed", async (roomId, user, time) => {
        let gameTime = db.data[roomId].time;
        let oldScore = db.data[roomId].scores[user];
        let score = Math.floor((time / gameTime) * 100);
        db.data[roomId].scores[user] = oldScore + score;
        await db.write();
        io.to(roomId).emit(
          "notification",
          `${user} guessed the word`,
          user,
          score
        );
        // let drawerScore = 0;
        // if (db.data[roomId].guessed === db.data[roomId].active.length - 1) {

        //     drawerScore = Math.floor(((db.data[roomId].guessed + 1) / (db.data[roomId].active - 1)) * 100);
        //     db.data[roomId].scores[db.data[roomId].currentDrawer] += drawerScore;

        //     db.data[roomId].guessed = 0;
        //     won = true;
        // }

        // if (won) {
        //     io.to(roomId).emit('roundFinished', db.data[roomId].scores, drawerScore);
        // }
      });

      socket.on("timeout", async (roomId, guessed) => {
        let cd = db.data[roomId].currentDrawer;
        let drawerScore = Math.floor(
          (guessed / (db.data[roomId].active.length - 1)) * 100
        );
        db.data[roomId].scores[cd] += drawerScore;
        await db.write();

        io.to(roomId).emit(
          "roundFinished",
          db.data[roomId].scores,
          drawerScore,
          cd
        );
      });

      socket.on("nextChance", async (roomId, newGame = false) => {
        let idx;
        let len = db.data[roomId].active.length;
        if (newGame) {
          for (let player of db.data[roomId].active) {
            db.data[roomId].scores[player] = 0;
          }

          db.data[roomId].currentRound = 0;
          await db.write();

          idx = Math.floor(Math.random() * db.data[roomId].active.length);
          db.data[roomId].ogIndex = idx;
          db.data[roomId].currentRound += 1;
        } else {
          idx = db.data[roomId].index + 1;
          if (idx % len === db.data[roomId].ogIndex)
            db.data[roomId].currentRound += 1;
        }

        idx = idx % len;
        db.data[roomId].index = idx;
        let cd = db.data[roomId].active[idx];
        let words = getRandDomWords(wordsList);
        db.data[roomId].currentDrawer = cd;
        await db.write();
        let { scores, currentDrawer, currentRound } = db.data[roomId];
        io.to(roomId).emit(
          "gameInfo",
          scores,
          currentDrawer,
          words,
          currentRound
        );
      });

      socket.on("clear", (roomId) => {
        io.to(roomId).emit("clear");
      });
    });

    //------------------Router Stuff----------------------------//

    router.use(bodyParser.json());
    router.use(cors());
    router.post("/:id", async (req, res) => {
      try {
        const { user, owner } = req.body;
        const roomId = req.params.id;
        if (!db.data[roomId]) {
          db.data[roomId] = {
            active: [],
            gameStarted: false,
            scores: {},
            // currentRound: 0,
          };
        }
        if (Boolean(owner)) {
          db.data[roomId].owner = user;
        }

        await db.write();

        res.status(200);
        res.end();
      } catch (e) {
        console.error(e);
      }
    });

    router.get("/:id", (req, res) => {
      try {
        if (db.data[req.params.id]) {
          res.status(200).json(db.data[req.params.id]);
        } else {
          res.status(404);
          res.end();
        }
      } catch (e) {
        console.error(e);
      }
    });

    router.put("/:id/members", async (req, res) => {
      try {
        const { user } = req.body;
        if (user && typeof user === "string") {
          if (!db.data[req.params.id]["active"].includes(user)) {
            db.data[req.params.id]["active"].push(user);
          } else {
            res.status(200).end("already there");
          }
        } else {
          res.status(400).end("bad data");
        }
        await db.write();
        res.end();
      } catch (e) {
        console.error(e);
      }
    });

    router.put("/:id", async (req, res) => {
      try {
        db.data[req.params.id] = Object.assign(
          {},
          db.data[req.params.id],
          req.body
        );
        await db.write();

        res.status(200).end();
      } catch (e) {
        res.status(400).send("Bad request");
        console.error(e);
      }
    });
  })
  .catch((e) => {
    console.error(e);
  });

export default router;
