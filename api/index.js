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
const db = require("better-sqlite3")("database.db");

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
            );
			CREATE TABLE IF NOT EXISTS module_pages (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				module_id INTEGER NOT NULL,
				title TEXT NOT NULL,
				type TEXT NOT NULL,
				content TEXT,
				createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
			);
			CREATE TABLE IF NOT EXISTS module_files (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				page_id INTEGER NOT NULL,
				title TEXT NOT NULL,
				file TEXT NOT NULL,
				createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
			);
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
function getModulebyID(id) {
	const row = db.prepare("SELECT * FROM modules WHERE id = ?").get(id);
	try {
		const { teacher, course, content, createdAt, updatedAt } = row;
		return { teacher, course, content: JSON.parse(content), createdAt, updatedAt };
	} catch (error) {
		console.error("Error getting module by ID:", error);
		return null;
	}
}
app.get("/modules", (req, res) => {
    if (!req.query.id || req.query.id.trim() === "" || isNaN(req.query.id) || parseInt(req.query.id, 10) <= 0) {
        res.status(400).send("Invalid or missing id parameter. " + req.query.id);
        return;
    }
    const id = parseInt(req.query.id, 10);
    res.sendFile(__dirname + "/frontend/module.html");
});
app.get("/moduledata", (req, res) => {
	if (!req.query.id || req.query.id.trim() === "" || isNaN(req.query.id) || parseInt(req.query.id, 10) <= 0) {
		res.status(400).send("Invalid or missing id parameter. " + req.query.id);
		return;
	}
	const id = parseInt(req.query.id, 10);
	const moduleData = getModulebyID(id);
	if (!moduleData) {
		res.status(404).json({ error: "Module not found" });
		return;
	}
	res.json(moduleData);
})
app.get("/new", (req, res) => {
    res.sendFile(__dirname + "/frontend/new.html");
});

// api
async function getCanvasModules(canvasURL, courseID, canvasAPIkey, teacher, courseName) {
    try {
        const url = `${canvasURL}/api/v1/courses/${courseID}/modules?include[]=items`;
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${canvasAPIkey}`,
                "Content-Type": "application/json"
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const modules = await response.json();
        const prepedInster = db.prepare(`INSERT INTO modules (course, teacher, content, apikey, canvasurl, courseid) VALUES (?, ?, ?, ?, ?, ?)`);
        prepedInster.run(courseName, teacher, JSON.stringify(modules), canvasAPIkey, canvasURL, courseID);
        
        return modules;
    } catch (error) {
        console.error("Error fetching Canvas modules:", error);
        throw error;
    }
}
async function getCanvasPages(canvasURL, courseID, canvasAPIkey, pageURL, type, module_id) {
	const response = await fetch(pageURL, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${canvasAPIkey}`,
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		console.error(
			`Error fetching page ${pageURL}: ${response.status} ${response.statusText}`
		);
		return null;
	}

	const page = await response.json();
	// console.log(`Page data for ${pageURL}:`, page);
	const preppedInsert = db.prepare(
		`INSERT INTO module_pages (module_id, title, type, content) VALUES (?, ?, ?, ?)`
	);
	preppedInsert.run(module_id, page.title, type, page.body); // TODO strip down body even more
	if (page.body.includes("data-api-endpoint")) {
		const fileLinks = [...page.body.matchAll(/<a[^>]*data-api-endpoint="([^"]+)"[^>]*>/g)];
		// console.log(`Found ${fileLinks.length} file links`);
		
		for (const link of fileLinks) {
			const apiEndpoint = link[1];
			// console.log(`Processing file from API endpoint: ${apiEndpoint}`);
			
			try {
				const gotFile = await getFileDownloadLink(
					canvasURL,
					courseID,
					canvasAPIkey,
					apiEndpoint
				);
				if (gotFile) {
					const downloadLink = gotFile.url;
					const filePreppedInsert = db.prepare(`INSERT INTO module_files (page_id, title, file) VALUES (?, ?, ?)`);
					filePreppedInsert.run(module_id, gotFile.display_name, downloadLink);
					// console.log(`Inserted file: ${gotFile.display_name}`);
				}
			} catch (error) {
				console.error(`Error processing file: ${error}`);
			}
		}
	}
	return page;
}
async function getFileDownloadLink(canvasURL, courseID, canvasAPIkey, apiEndpointURL) {
	const response = await fetch(apiEndpointURL, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${canvasAPIkey}`,
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		console.error(`Error fetching file from ${apiEndpointURL}: ${response.status} ${response.statusText}`);
		return null;
	}
	
	const file = await response.json();
	return file;
}
app.get("/newmodule", async (req, res) => {
    const { canvasURL, courseID, canvasAPIkey, teacher, courseName } = req.query;
    // console.log(canvasURL, courseID, canvasAPIkey);

	const existing = db.prepare("SELECT * FROM modules WHERE teacher = ? AND course = ?").get(teacher, courseName);
	if (existing) {
		res.status(400).json({ error: "Module already exists for this teacher and course." });
		return;
	}

    const modules = await getCanvasModules(canvasURL, courseID, canvasAPIkey, teacher, courseName);

	for (const category of modules) {
		for (const item of category.items) {
			const { type, url, title } = item;
			if (type === "Page" && url) {
				await getCanvasPages(canvasURL, courseID, canvasAPIkey, url, type, item.id);
			} else if (type === "File" && url) {
				// console.log(`Processing file: ${title} from ${url}`);
				try {
					const fileData = await getFileDownloadLink(canvasURL, courseID, canvasAPIkey, url);
					if (fileData) {
						const filePreppedInsert = db.prepare(`INSERT INTO module_files (page_id, title, file) VALUES (?, ?, ?)`);
						filePreppedInsert.run(item.id, fileData.display_name, fileData.url);
						// console.log(`Inserted file: ${fileData.display_name}`);
					}
				} catch (error) {
					console.error(`Error processing file ${title}: ${error}`);
				}
			}
		}
	}
	
    res.send(modules);
})
async function updateModules(id) {
    try {
        const row = db.prepare("SELECT canvasurl, courseid, apikey FROM modules WHERE id = ?").get(id);
        if (!row) {
            console.error("No module found with id:", id);
            return "No module found";
        }
        const { canvasurl, courseid, apikey } = row;
        const url = `${canvasurl}/api/v1/courses/${courseid}/modules?include[]=items`;
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apikey}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const dbprep = db.prepare("UPDATE modules SET content = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?");
        const modules = await response.json();
        dbprep.run(JSON.stringify(modules), id);

        const existingModule = db.prepare("SELECT content FROM modules WHERE id = ?").get(id);
        const oldModules = existingModule ? JSON.parse(existingModule.content) : [];
        const oldItemIds = [];
        for (const category of oldModules) {
            for (const item of category.items) {
                oldItemIds.push(item.id);
            }
        }

        if (oldItemIds.length > 0) {
            const placeholders = oldItemIds.map(() => '?').join(',');
            const clearFiles = db.prepare(`DELETE FROM module_files WHERE page_id IN (${placeholders})`);
            const clearPages = db.prepare(`DELETE FROM module_pages WHERE module_id IN (${placeholders})`);
            clearFiles.run(...oldItemIds);
            clearPages.run(...oldItemIds);
        }
        
		for (const category of modules) {
			for (const item of category.items) {
				const { type, url } = item;
				if (type === "Page" && url) {
					await getCanvasPages(canvasurl, courseid, apikey, url, type, item.id);
				}
				else if (type === "File" && url) {
					// console.log(`Processing file: ${item.title} from ${url}`);
					try {
						const fileData = await getFileDownloadLink(canvasurl, courseid, apikey, url);
						if (fileData) {
							const filePreppedInsert = db.prepare(`INSERT INTO module_files (page_id, title, file) VALUES (?, ?, ?)`);
							filePreppedInsert.run(item.id, fileData.display_name, fileData.url);
							// console.log(`Inserted file: ${fileData.display_name}`);
						}
					} catch (error) {
						console.error(`Error processing file ${item.title}: ${error}`);
					}
				}
			}
		}
        return "Module updated";
    } catch (error) {
        console.error("Error updating modules:", error);
        throw error;
    }
};
app.put("/updatemodules", async (req, res) => {
    const { id, password } = req.query;
	if (password !== process.env.adminpassword) {
		res.status(403).json({
			error: "Forbidden",
			message: "Invalid password",
		});
		return;
	}
    const response = await updateModules(id);
    res.send(response);
});
app.get("/modulepage", async (req, res) => {
	const { module_id } = req.query;
	const row = db.prepare("SELECT * FROM module_pages WHERE module_id = ?").all(module_id);
	res.json(row);
});
app.get("/modulefiles", async (req, res) => {
	const { page_id } = req.query;
	const row = db.prepare("SELECT * FROM module_files WHERE page_id = ?").all(page_id);
	res.json(row);
});
app.delete("/deletemodule", (req, res) => {
	const { id, password } = req.query;
	if (password !== process.env.adminpassword) {
		res.status(403).json({ error: "Forbidden", message: "Invalid password" });
		return;
	}
	const module = db.prepare("SELECT * FROM modules WHERE id = ?").get(id);
	if (!module) {res.status(400).json({ error: "No module found with this id." }); return;}
	const modules = JSON.parse(module.content);
	const itemIDs = [];
	for (const category of modules) {
		for (const item of category.items) {
			itemIDs.push(item.id);
		}
	}
	if (itemIDs.length > 0) {
		const placeholders = itemIDs.map(() => '?').join(',');
		const clearFiles = db.prepare(`DELETE FROM module_files WHERE page_id IN (${placeholders})`)
		const clearPages = db.prepare(`DELETE FROM module_pages WHERE module_id IN (${placeholders})`)
		clearFiles.run(...itemIDs);
		clearPages.run(...itemIDs);
	}

	db.prepare("DELETE FROM modules WHERE id = ?").run(id);
	res.json({ success: true, message: `Module with id ${id} deleted.` });
});

app.listen(port, () => {
    console.log(`listening on port ${port}`);
});