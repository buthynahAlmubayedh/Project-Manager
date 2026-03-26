import 'dotenv/config';
import express from "express";
import expressLayouts from "express-ejs-layouts";
import {dirname} from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import { Client } from "pg";
import { validPassword } from './middleware/Password-Validation.js';
import { checkAuth } from './middleware/checkAuth.js';
import session from "express-session";
import pgSession from 'connect-pg-simple';
import helmet from 'helmet';



import pkg from 'pg'; // Changed to handle Pool
const { Pool } = pkg; 

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT;

// View Engine Setup
app.use(expressLayouts);
app.set("view engine", "ejs");
app.set("views", "./views");
app.set("layout", "layout");

app.use(express.static(__dirname + '/public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helmet Configuration
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net","https://www.jsdelivr.com" ],
        scriptSrcAttr: ["'unsafe-inline'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        "connect-src": ["'self'", "https://cdn.jsdelivr.net", "http://localhost:*", "ws://localhost:*"],
      },
    },
  })
);

// DB Setup - Use POOL for Supabase
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  family: 4 
});


db.connect()
  .then(() => console.log("Connected to Supabase"))
  .catch((err) => console.error("❌ DB Error:", err));

db.on('error', (err) => console.error('Unexpected error on idle client', err));

// Session Setup
const pgStore = pgSession(session);
app.use(session({ 
  store: new pgStore({
    pool: db,                  
    tableName: 'session',      
    createTableIfMissing: true 
  }),
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  resave: false,
  saveUninitialized: false,
  proxy: true, // Required for secure cookies behind proxies like Render/Heroku
  cookie: { 
    secure: process.env.NODE_ENV === 'production',             
    maxAge: 1000 * 60 * 60 * 24, 
    httpOnly: true,            
    sameSite: 'lax'            
  }
}));

app.get('/status', async (req, res) => {
  try {
    const dbResult = await db.query('SELECT 1');
    res.json({
      status: 'Online',
      database: dbResult ? 'Connected' : 'Error',
      sessionID: req.sessionID
    });
  } catch (err) {
    res.status(500).json({ status: 'Offline', error: err.message });
  }
});


app.get("/register", (req, res) => {
  res.render("pages/register.ejs", {
      title: "register"
  });
});

app.post('/submit', validPassword, async (req, res) => { // REGISTER
  const { username, email, password, confirmPassword } = req.body;

  try {
      const query = `
        INSERT INTO users (username, email, password, created_at, last_login) 
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING user_id, username`;
        
      const now = new Date();
      const values = [username, email, password, now, now];
      
      const dbRes = await db.query(query, values);
      const newUser = dbRes.rows[0]; 

      req.session.userId = newUser.user_id;
      req.session.username = newUser.username;
      
      // FIX: Only ONE response allowed
      res.status(201).send(`Account successfully created for ${newUser.username} (ID: ${newUser.user_id})!`);

    } catch (err) {
      if (err.code === '23505') { 
          return res.status(409).send('This username or email is already taken.');
      }
      console.error('Database Error:', err.message);
      res.status(500).send('Error saving data to database');
  }
});



// GET Login Page
app.get("/login", (req, res) => {
  res.render("pages/login.ejs", {
      title: "Login"
  });
});

// POST Login Handler
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
      const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = result.rows[0];

      if (user && user.password === password) {
          // 1. REGENERATE: Deletes the old session and creates a new unique one
          req.session.regenerate((err) => {
              if (err) return res.status(500).send("Session error");

              // 2. Assign data to the NEW session
              req.session.userId = user.user_id;
              req.session.username = user.username;

              // 3. SAVE: Ensures the new session is written to SQL before responding
              req.session.save((err) => {
                  if (err) return res.status(500).send("Save error");
                  return res.status(200).send("Login successful");
              });
          });
      } else {
          return res.status(401).send("Invalid email or password");
      }
  } catch (err) {
    console.error("Login route error:", err);
      res.status(500).send("Server error");
  }
});



app.get("/", async (req, res) => {
  try {
      if (req.session.userId) {
          // UPDATE for 2026: Include tasks (t) in the JOIN logic
          // This ensures assigned users see the project on their home list
          const query = `
            SELECT DISTINCT p.* 
            FROM projects p
            LEFT JOIN project_members pm ON p.project_id = pm.project_id
            WHERE p.user_id = $1            -- User is the owner
               OR (pm.user_id = $1 AND pm.status = 'Accepted') -- User has accepted invite
            ORDER BY p.created_at DESC`;

          
          const result = await db.query(query, [req.session.userId]);

          return res.render("home.ejs", {
              title: "My Dashboard",
              isLoggedIn: true,
              username: req.session.username,
              projects: result.rows,
              userId: req.session.userId 
          });
      }
      
      // Guest View
      res.render("home.ejs", { 
          title: "Welcome", 
          isLoggedIn: false,
          projects: [] 
      });
  } catch (err) {
      console.error("Home Route Error:", err);
      res.status(500).send("Error loading dashboard. Please try again later.");
  }
});



app.get("/logout", (req, res) => {
  req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.redirect("/"); // Takes them back to the guest home page
  });
});


app.get("/create-project",
  (req,res)=>{
    res.render("pages/create-project.ejs",{
      title: "Create Project",
      isLoggedIn: true,
    }
    )
  }
);

app.get("/invitations", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  try {
      const query = `
          SELECT p.project_id, p.name, p.description, u.username as inviter_name
          FROM project_members pm
          JOIN projects p ON pm.project_id = p.project_id
          JOIN users u ON p.user_id = u.user_id
          WHERE pm.user_id = $1 AND pm.status = 'Pending'
          ORDER BY p.created_at DESC`;

      const result = await db.query(query, [req.session.userId]);

      res.render("pages/invitations", {
          title: "Project Invitations",
          isLoggedIn: true,
          invites: result.rows,
          username: req.session.username
      });
  } catch (err) {
      console.error(err);
      res.status(500).send("Error loading invitations.");
  }
});




// Example route where you send the email
app.post("/project/:id/invite", async (req, res) => {
  const { email } = req.body;
  const projectId = req.params.id;

  try {
      // 1. Find the user ID from the email
      const userResult = await db.query("SELECT user_id FROM users WHERE email = $1", [email]);
      
      if (userResult.rows.length === 0) {
          return res.status(404).send("User not found with that email.");
      }
      
      const invitedUserId = userResult.rows[0].user_id;

      // 2. CREATE the database record first
      // This makes the invite visible on their /invitations page
      await db.query(
          `INSERT INTO project_members (project_id, user_id, status) 
           VALUES ($1, $2, 'Pending') 
           ON CONFLICT (project_id, user_id) DO NOTHING`, 
          [projectId, invitedUserId]
      );

      // 3. NOW send the email
      // sendInvitationEmail(email, projectId); 

      res.redirect(`/project/${projectId}?msg=InviteSent`);
  } catch (err) {
      console.error(err);
      res.status(500).send("Error sending invitation.");
  }
});


// ACCEPT INVITATION
// ACCEPT
// ACCEPT
app.post("/project/:id/accept-invite", async (req, res) => {
  try {
      await db.query(
          "UPDATE project_members SET status = 'Accepted' WHERE project_id = $1 AND user_id = $2",
          [req.params.id, req.session.userId]
      );
      // Now they have access, redirect to the dashboard
      res.redirect(`/project/${req.params.id}`);
  } catch (err) {
      res.status(500).send("Error accepting invitation");
  }
});

// DECLINE
app.post("/project/:id/decline-invite", async (req, res) => {
  try {
      // Removing the row revokes access entirely
      await db.query(
          "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2",
          [req.params.id, req.session.userId]
      );
      res.redirect("/invitations");
  } catch (err) {
      res.status(500).send("Error declining invitation");
  }
});


app.post('/submit-project', async (req, res) => {
  const { name, description, start_date, status, manager_name } = req.body;
  const creatorId = req.session.userId;

  if (!name) return res.status(400).send("Error: Project Name is required.");
  if (!creatorId) return res.status(401).send("Please login first.");

  try {
      // Start a Transaction
      await db.query('BEGIN');

      // 1. Insert the Project
      const projectQuery = `
          INSERT INTO projects (user_id, name, description, status, start_date, manager_name) 
          VALUES ($1, $2, $3, $4, $5, $6) 
          RETURNING project_id`;
      
      const projectValues = [creatorId, name, description, status, start_date, manager_name];
      const result = await db.query(projectQuery, projectValues);
      const newProjectId = result.rows[0].project_id;

      // 2. CRITICAL FIX: Automatically add creator as the first member
      // This ensures the "Assign To" dropdown has at least one person (the owner)
      await db.query(
          "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)",
          [newProjectId, creatorId, 'Owner']
      );

      // Commit the Transaction
      await db.query('COMMIT');
      
      res.redirect("/");
  } catch (err) {
      await db.query('ROLLBACK'); // Cancel changes if anything fails
      console.error("Database Error:", err.message);
      res.status(500).send("Failed to save project.");
  }
});

app.get("/project/:id", async (req, res) => {
  const projectId = req.params.id;
  const currentUserId = req.session.userId;

  if (!currentUserId) return res.redirect("/login");

  try {
      // 1. Fetch Project Details with "Assignment-Based" Authorization
      // Added a LEFT JOIN on tasks (t) to check if currentUserId is the assignee
      const projectQuery = `
          SELECT DISTINCT p.*, u.username as owner_name 
          FROM projects p
          JOIN users u ON p.user_id = u.user_id
          LEFT JOIN project_members pm ON p.project_id = pm.project_id
          LEFT JOIN tasks t ON p.project_id = t.project_id
          WHERE p.project_id = $1 
          AND (
            p.user_id = $2 OR 
            pm.user_id = $2 OR 
            t.assigned_user_id = $2
          )
          LIMIT 1`;

      const projectRes = await db.query(projectQuery, [projectId, currentUserId]);
      const project = projectRes.rows[0];

      // 2. Security: If no project is returned, they have no permission
      if (!project) {
          console.warn(`Unauthorized access attempt to project ${projectId} by user ${currentUserId}`);
          return res.redirect("/");
      }

      // 3. Fetch Tasks (including assignee names)
      const tasksRes = await db.query(`
          SELECT t.*, u.username as assigned_to_name 
          FROM tasks t 
          LEFT JOIN users u ON t.assigned_user_id = u.user_id 
          WHERE t.project_id = $1 
          ORDER BY t.task_id DESC`, [projectId]);

      // 4. Fetch EVERYONE for the "Assign To" dropdown
      const allUsersRes = await db.query(`
        SELECT u.user_id, u.username 
        FROM users u
        JOIN project_members pm ON u.user_id = pm.user_id
        WHERE pm.project_id = $1 AND pm.status = 'Accepted'
        
        UNION 
        
        -- Also include the Project Owner in the list so they can be assigned tasks
        SELECT u.user_id, u.username 
        FROM users u
        JOIN projects p ON u.user_id = p.user_id
        WHERE p.project_id = $1
        
        ORDER BY username ASC
    `, [projectId]);

    // Inside your GET route loop for tasks

    let tasks = tasksRes.rows;
for (let task of tasks) {
  const historyRes = await db.query(
      'SELECT * FROM task_history WHERE task_id = $1 ORDER BY changed_at DESC', 
      [task.task_id]
  );
  task.history = historyRes.rows;
}

    
  //  const acceptedMembers = allUsersRes.rows.filter(user => user.status === 'Accepted');

      res.render("pages/project-dashboard", {
          title: project.name,
          project: project,
          tasks: tasksRes.rows,
          members: allUsersRes.rows, 
          currentUser: req.session.username,
          isLoggedIn: true,
      });

  } catch (err) {
      console.error("Dashboard Load Error:", err.message);
      res.status(500).send("Error loading project dashboard.");
  }
});

app.post('/task/:id/update', async (req, res) => {
  const taskId = req.params.id;
  const { status, priority, project_id, comment } = req.body;
  const currentUser = req.session.username;

  try {
      // 1. Fetch task and project owner for Authorization
 const taskData = await db.query(`
    SELECT 
        t.*, 
        u.username AS assigned_to_name, 
        owner_table.username AS owner_name 
    FROM tasks t 
    JOIN projects p ON t.project_id = p.project_id 
    JOIN users owner_table ON p.user_id = owner_table.user_id 
    LEFT JOIN users u ON t.assigned_user_id = u.user_id 
    WHERE t.task_id = $1`, [taskId]);
      
      if (taskData.rows.length === 0) return res.status(404).send("Task not found");
      const task = taskData.rows[0];

      // 2. Security Check: Only Owner or Assignee
      if (currentUser !== task.owner_name && currentUser !== task.assigned_to_name) {
          return res.status(403).send("Unauthorized: Only the owner or assignee can update this task.");
      }

      const oldStatus = task.status;
      const oldPriority = task.priority;

      // 3. Perform the Update
      await db.query(
          'UPDATE tasks SET status = $1, priority = $2 WHERE task_id = $3',
          [status, priority, taskId]
      );

      // 4. Log History (Status Change)
      if (oldStatus !== status) {
          await db.query(
              'INSERT INTO task_history (task_id, changed_by, change_type, old_value, new_value, update_comment) VALUES ($1, $2, $3, $4, $5, $6)',
              [taskId, currentUser, 'Status Change', oldStatus, status, comment || null]
          );
      }

      // 5. Log History (Priority Change)
      if (oldPriority !== priority) {
          await db.query(
              'INSERT INTO task_history (task_id, changed_by, change_type, old_value, new_value, update_comment) VALUES ($1, $2, $3, $4, $5, $6)',
              [taskId, currentUser, 'Priority Change', oldPriority, priority, comment || null]
          );
      }

      res.redirect(`/project/${project_id}`);
  } catch (err) {
      console.error("Update Error:", err.message);
      res.status(500).send("Error updating task.");
  }
});



// --- 2. ADD TASK LOGIC (Updated to include Assignee) ---
app.post("/project/:id/task", async (req, res) => {
  const projectId = req.params.id;
  const { title, description, priority, assigned_user_id, status } = req.body;

  try {
      const assignee = assigned_user_id === "" ? null : assigned_user_id;

      await db.query(
          `INSERT INTO tasks (project_id, title, description, priority, assigned_user_id, status) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [projectId, title, description, priority, assignee, status || 'To Do']
      );

      res.redirect(`/project/${projectId}`);
  } catch (err) {
      console.error("Error adding task:", err.message);
      res.status(500).send("Failed to create task.");
  }
});

app.post('/project/:id/update', async (req, res) => {
  const projectId = req.params.id;
  const { name, description, status } = req.body;

  try {
      const query = `
          UPDATE projects 
          SET name = $1, description = $2, status = $3 
          WHERE project_id = $4
      `;
      await db.query(query, [name, description, status, projectId]);

      // Redirect back to the dashboard to see changes
      res.redirect(`/project/${projectId}`);
  } catch (err) {
      console.error("Update Error:", err.message);
      res.status(500).send("Error updating project.");
  }
});



// --- 3. ADD MEMBER LOGIC (Duplicates removed and merged) ---
app.post("/project/:id/add-member", async (req, res) => {
  const { email } = req.body;
  const projectId = req.params.id;

  try {
      // Find the user by email
      const userResult = await db.query("SELECT user_id FROM users WHERE email = $1", [email]);
      
      if (userResult.rows.length === 0) {
          return res.status(404).send("User not found. They must register first.");
      }
      
      const invitedUserId = userResult.rows[0].user_id;

      // Insert invitation. 
      // This makes it show up on the user's /invitations page.
      await db.query(
          `INSERT INTO project_members (project_id, user_id, status) 
           VALUES ($1, $2, 'Pending') 
           ON CONFLICT (project_id, user_id) DO NOTHING`, 
          [projectId, invitedUserId]
      );
      
      res.redirect(`/project/${projectId}?msg=InviteSent`);
  } catch (err) {
      console.error(err);
      res.status(500).send("Error sending invitation.");
  }
});






app.get("/home",
  (req,res)=>{
    res.render("home.ejs",{
      title: "Home Page"
    }
    )
  }
);


console.log(`working here`);
app.listen(port,
    ()=>{
        console.log(`listening in: ${port}`);
    }
)

