const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();
const app = express();
const port = process.env.port || 3001;
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const db = require('better-sqlite3')('database.db');

const initDatabase = () => {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS modules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course TEXT NOT NULL,
                teacher TEXT NOT NULL,
                content TEXT NOT NULL,
                apikey TEXT NOT NULL,
                canvasurl TEXT NOT NULL,
                courseid TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("Database initialized successfully");
    } catch (error) {
        console.error("Database initialization error:", error);
    }
};
initDatabase();

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/frontend/index.html");
});
app.get("/admin", (req, res) => {
    if (req.query.password == process.env.adminpassword) {
        res.sendFile(__dirname + "/frontend/admin.html");
    }
    else {
        res.status(403).json({ error: "Forbidden", message: "Invalid password" });
    }
});
app.get("/modules", (req, res) => {
    if (!req.query.id || req.query.id.trim() === "" || isNaN(req.query.id) || parseInt(req.query.id, 10) <= 0) {
        res.status(400).send("Invalid or missing id parameter. " + req.query.id);
        return;
    }
    const id = parseInt(req.query.id, 10);
    res.send("TODO get module: " + id);
});
app.get("/new", (req, res) => {
    res.sendFile(__dirname + "/frontend/new.html");
});

// api
async function getCanvasModules(canvasURL, courseID, canvasAPIkey, teacher, courseName) {
    const url = `${canvasURL}/api/v1/courses/${courseID}/modules?include[]=items`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${canvasAPIkey}`,
            'Content-Type': 'application/json'
        }
    });
    const modules = await response.json();
    const prepedInster = db.prepare(`INSERT INTO modules (course, teacher, content, apikey, canvasurl, courseid) VALUES (?, ?, ?, ?, ?, ?)`);
    prepedInster.run(courseName, teacher, JSON.stringify(modules[0]), canvasAPIkey, canvasURL, courseID);
    
    return modules;
}
app.get("/newmodule", async (req, res) => {
    const { canvasURL, courseID, canvasAPIkey, teacher, courseName } = req.query;
    // console.log(canvasURL, courseID, canvasAPIkey);
    const modules = await getCanvasModules(canvasURL, courseID, canvasAPIkey, teacher, courseName);
    res.send(modules);
})
async function updateModules(id) {
    // only select needed vars
    const row = db.prepare('SELECT canvasurl, courseid, apikey, FROM modules WHERE id = ?').get(id);
    if (!row) {
        console.error("No module found with id:", id);
        return "No module found";
    }
    const { canvasurl, courseid, apikey } = row;
    const url = `${canvasurl}/api/v1/courses/${courseid}/modules?include[]=items`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apikey}`,
            'Content-Type': 'application/json'
        }
    });
    const dbprep = db.prepare('UPDATE modules SET content = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?');
    const modules = await response.json();
    dbprep.run(JSON.stringify(modules[0]), id);
    return "Module updated";
};
app.put("/updatemodules", async (req, res) => {
    const { id } = req.query;
    const response = await updateModules(id);
    res.send(response);
});

app.listen(port, () => {
    console.log(`listening on port ${port}`);
});