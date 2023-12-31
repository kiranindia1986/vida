require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const { poolPromise } = require('./database');

const app = express();
const port = 3000;

// Email Transporter Configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});




app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const bcrypt = require('bcrypt');
const saltRounds = 12; // the cost factor for hashing


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Adjust the path according to your server structure
        const uploadPath = path.join(__dirname, './uploads'); 
        cb(null, uploadPath); 
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

// Use this storage configuration with multer
const upload = multer({ storage: storage });


const corsOptions = {
    origin: 'http://localhost:3002', // Replace with your frontend's URL
    optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));


app.post('/api/login', async (req, res) => {
    try {
        // Extract email and password from request body
        const { email, password } = req.body;

        // Get user from database
        const pool = await poolPromise;
        const request = pool.request();
        request.input('Email', email);
        const query = 'SELECT * FROM Users WHERE UserEmail = @Email';
        const result = await request.query(query);

        if (result.recordset.length === 1) {
            const user = result.recordset[0];

            console.log("Plaintext password:", password);
            console.log("Hashed password from DB:", user.UserPassword);

            // Compare plaintext password with hashed password using bcrypt's callback approach
            bcrypt.compare(password, user.UserPassword, function (err, isMatch) {
                if (err) {
                    console.error("Error comparing password:", err);
                    return res.status(500).json({ error: 'Error comparing password' });
                }

                console.log("Password match:", isMatch);

                if (isMatch) {
                    // Login success
                    res.json({ message: 'Login successful', user });
                } else {
                    // Password does not match
                    res.status(401).json({ error: 'Invalid email or password' });
                }
            });

        } else {
            // User not found
            res.status(404).json({ error: 'User not found' });
        }
    } catch (err) {
        // Handle errors
        console.error("Error in /api/login route:", err);
        res.status(500).json({ error: 'An unknown error occurred' });
    }
});


// Single route handler for '/api/users'
// Route to get user details
app.get('/api/users', async (req, res) => {
    try {
        console.log("Attempting to connect to database...");
        const pool = await poolPromise;
        if (!pool) {
            throw new Error('Failed to get database pool');
        }
        console.log("Connected to database. Executing query...");
        const request = pool.request();

        // Modify this query as per your Users table structure
        const query = 'SELECT * FROM Users';
        const result = await request.query(query);

        console.log("Query executed. Sending data...");
        res.json(result.recordset); // Send the user data
    } catch (err) {
        console.error("Error in /api/users route:", err);
        res.status(500).json({ error: err.message || 'An unknown error occurred' });
    }
});

//Audit Log
app.post('/api/audit-log', async (req, res) => {
    try {
        const { action, status, details, timestamp } = req.body;
        const userEmail = details.userEmail; // Extract the userEmail from details
        const pool = await poolPromise;
        const request = pool.request();

        // SQL Query to insert log entry
        const query = `
          INSERT INTO AuditLog (action, status, userEmail, timestamp) 
          VALUES (@Action, @Status, @UserEmail, @Timestamp)
        `;

        request.input('Action', action);
        request.input('Status', status);
        request.input('UserEmail', userEmail);
        request.input('Timestamp', new Date(timestamp)); // Ensure that the timestamp is in a format SQL Server can understand

        await request.query(query);

        console.log("Audit Log Entry:", req.body);
        res.status(200).json({ message: 'Log entry recorded' });
    } catch (err) {
        console.error("Error in /api/audit-log route:", err);
        res.status(500).json({ error: 'Failed to record log entry' });
    }
});

//View Audit Logs
app.get('/api/view-audit-log', async (req, res) => {
    try {
        const pool = await poolPromise;
        const request = pool.request();

        // SQL Query to select log entries
        const query = `SELECT top 100 * FROM AuditLog ORDER BY timestamp DESC`;

        const result = await request.query(query);

        // Send the fetched log entries to the client
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error("Error in /api/view-audit-log route:", err);
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
});



// Single route handler for '/api/createadmin'
app.post('/api/createadmin', upload.single('imageFile'), async (req, res) => {
    try {
        // Generate a timestamp for 2 hours in the future
        const resetPasswordExpires = new Date();
        resetPasswordExpires.setHours(resetPasswordExpires.getHours() + 2);

        // Log received data for debugging
        console.log('Received Data:', req.body);

        // Get a database connection and execute SQL query
        const pool = await poolPromise;
        if (!pool) {
            throw new Error('Failed to get database pool');
        }
        const request = pool.request();

        // Add parameters from req.body
        request.input('FullName', req.body.FullName);
        request.input('UserEmail', req.body.Email);
        request.input('CompanyName', req.body.CompanyName);
        request.input('PhoneNumber', req.body.PhoneNumber);
        request.input('CompanyAddressLine1', req.body.CompanyAddressLine1);
        request.input('CompanyAddressLine2', req.body.CompanyAddressLine2);
        request.input('State', req.body.State1);
        request.input('Country', req.body.Country);
        request.input('ZipCode', req.body.ZipCode);
        request.input('UserLimit', req.body.UserLimit);
        request.input('ResetPasswordExpires', resetPasswordExpires);

        // Handle the image file
        let imagePath = '';
        if (req.file) {
            imagePath = req.file.path; // Path where the image is stored
        }
        request.input('ImagePath', imagePath); // Add image path to the SQL query

        // After successful database interaction, send an email

        // Construct and execute your SQL query
        const query = `
        INSERT INTO Users (
            FullName,
            UserEmail,
            CompanyName,
            PhoneNumber,
            CompanyAddressLine1,
            CompanyAddressLine2,
            State,
            Country,
            ZipCode,
            UserLimit,
            ImagePath,
            UserPassword,
            UserRole,
            Verified,
            ResetPasswordExpires
        ) VALUES (
            @FullName,
            @UserEmail,
            @CompanyName,
            @PhoneNumber,
            @CompanyAddressLine1,
            @CompanyAddressLine2,
            @State,
            @Country,
            @ZipCode,
            @UserLimit,
            @ImagePath,
            '',
            'Admin',
            'N',
            @ResetPasswordExpires
        )`;

        console.log("Executing query: ", query); // Log the query to console

        const result = await request.query(query);

        console.log('Query Result:', result);

        const baseUrl = process.env.URL;


        const emailOptions = {
            from: process.env.EMAIL_FROM,
            to: req.body.Email,
            subject: 'Welcome to Vida - Complete Your Registration',
            html: `
                <h1>Welcome to Vida!</h1>
                <p>We're excited to have you on board. To get started with your admin account, complete your registration.</p>
                <p>You can complete your registration and set a new password by clicking on the link below:</p>
                <a href="${baseUrl}/reset-password?email=${encodeURIComponent(req.body.Email)}" target="_blank">Complete Registration</a>
                <p>If the above link doesn't work, please copy and paste the following URL into your browser:</p>
                <p>${baseUrl}/reset-password?email=${encodeURIComponent(req.body.Email)}</p>
                <p>If you have any questions or need assistance, feel free to contact our support team.</p>
                <p>Best Regards,</p>
                <p>Vida Team</p>
            `
        };

        transporter.sendMail(emailOptions, (error, info) => {
            if (error) {
                console.error('Email send error:', error);
            } else {
                console.log('Email sent:', info.response);
            }
        });


        res.json({ message: 'Admin created and email sent', result });

    } catch (err) {
        if (err instanceof Error) {
            res.status(500).send(err.message);
        } else {
            res.status(500).send('An unknown error occurred');
        }
    }
});


// Single route handler for '/api/SystemSetting'
app.post('/api/SystemSetting', async (req, res) => {
    try {
        // Log received data for debugging
        console.log('Received Data:', req.body);

        // Get a database connection
        const pool = await poolPromise;
        if (!pool) {
            throw new Error('Failed to get database pool');
        }
        const request = pool.request();

        // Hash the password
        const hashedPassword = await bcrypt.hash(req.body.SMTPPassword, saltRounds);

        // Add parameters from req.body
        request.input('SMTPEmailAddress', req.body.SMTPEmailAddress);
        request.input('SMTPPassword', hashedPassword);

        // Check if there is any existing record
        const checkQuery = `SELECT COUNT(*) as count FROM SystemSettings`;
        const checkResult = await request.query(checkQuery);
        const exists = checkResult.recordset[0].count > 0;

        let query = '';
        if (exists) {
            // Update logic
            query = `
            UPDATE SystemSettings
            SET SMTPEmailAddress = @SMTPEmailAddress,
                SMTPPassword = @SMTPPassword
            `;
        } else {
            // Insert logic
            query = `
            INSERT INTO SystemSettings (
                SMTPEmailAddress,
                SMTPPassword
            ) VALUES (
                @SMTPEmailAddress,
                @SMTPPassword
            )`;
        }

        console.log("Executing query: ", query); // Log the query to console

        const result = await request.query(query);

        console.log('Query Result:', result);

        res.json({ message: exists ? 'SMTP Details Updated' : 'SMTP Details Inserted', result });

    } catch (err) {
        if (err instanceof Error) {
            res.status(500).send(err.message);
        } else {
            res.status(500).send('An unknown error occurred');
        }
    }
});

//Reset Password

app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        // Perform validation on the newPassword if needed

        const pool = await poolPromise;
        const request = pool.request();
        // Assuming you have a hashing function to securely store passwords
        // Hash the password
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        const updateQuery = `
            UPDATE Users
            SET UserPassword = @newPassword, Verified = 'Y'
            WHERE UserEmail = @Email
        `;

        request.input('newPassword', hashedPassword);
        request.input('Email', email);

        await request.query(updateQuery);

        res.json({ message: 'Password updated successfully.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating password.' });
    }
});


app.get('/api/validate-reset-link', async (req, res) => {
    try {
        const email = req.query.email;
        const pool = await poolPromise;
        const request = pool.request();

        request.input('Email', email);
        const result = await request.query(`
            SELECT ResetPasswordExpires FROM Users WHERE UserEmail = @Email and Verified = 'N'
        `);

        const user = result.recordset[0];
        if (!user || new Date() > new Date(user.ResetPasswordExpires)) {
            throw new Error('Link has expired.');
        }

        res.json({ message: 'Link is valid.' });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: 'Link is invalid or has expired.' });
    }
});

app.get('/', (req, res) => {
    res.send('Hello!')
  })


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});


