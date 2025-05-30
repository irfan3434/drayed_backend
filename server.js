require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const nodemailer = require('nodemailer');
const fs = require('fs');
const cors = require('cors');

const app = express();

// Check environment variables
if (!process.env.MONGO_URI || !process.env.OUTLOOK_EMAIL || !process.env.OUTLOOK_PASSWORD) {
  console.error('Error: Required environment variables are missing.');
  process.exit(1);
}

// Middleware
app.use(cors({ origin: 'https://aqeaw.com/' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads'); // Ensure the 'uploads' directory exists
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error('Invalid file type.'));
    } else {
      cb(null, true);
    }
  },
});
const uploadMiddleware = upload.any();
// Mongoose schemas
const applicationSchema = new mongoose.Schema({
  formType: { type: String, required: true },
  userType: { type: String },
  fullName: { type: String },
  applicantAge: { type: Number },
  applicantGender: { type: String },
  email: { type: String },
  phone: { type: String },
  tribeCheckbox: { type: String },
  specificAffiliation: { type: String },
  organizationName: { type: String },
  ownerName: { type: String },
  organizationEmail: { type: String },
  organizationNumber: { type: String },
  tribeCheckbox: { type: Boolean },
  specificAffiliation: { type: String },
  achievements: [
    {
      title: { type: String, required: true },
      description: { type: String, required: true },
      filePath: { type: String },
    },
  ],
  ndaAccepted: { type: Boolean, required: true },
  referrer: {
    fullName: { type: String },
    age: { type: Number },
    gender: { type: String },
    email: { type: String },
    phone: { type: String },
    nominationReason: { type: String },
  },
}, { timestamps: true });

const Application = mongoose.model('Application', applicationSchema);

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: 'smtp-mail.outlook.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.OUTLOOK_EMAIL,
    pass: process.env.OUTLOOK_PASSWORD,
  },
});

// Routes
app.get('/', (req, res) => res.send('Backend server is running!'));


// POST route
app.post('/submit-application', uploadMiddleware, async (req, res) => {
  try {
    console.log('Files:', req.files); // Debugging files
    console.log('Body:', req.body);  // Debugging body

    const {
      formType, userType, fullName, applicantAge, applicantGender, email, phone,
      organizationName, ownerName, organizationEmail, organizationNumber,
      tribeCheckbox, specificAffiliation, ndaAccepted,
      achievementTitle, description, achievementTitleOrg, descriptionOrg,
      referrerFullName, referrerAge, referrerGender, referrerEmail, referrerPhone, nominationReason,
    } = req.body;

    // Process achievements
    const achievements = formType === 'personal'
    ? (Array.isArray(achievementTitle) ? achievementTitle.map((title, index) => {
        const file = req.files[index]; // Match file by index
        return {
          title,
          description: description[index],
          filePath: file?.path || null, // Assign the correct file path
        };
      }) : [
        {
          title: achievementTitle,
          description,
          filePath: req.files[0]?.path || null, // Handle single file
        },
      ])
    : (Array.isArray(achievementTitleOrg) ? achievementTitleOrg.map((title, index) => {
        const file = req.files[index]; // Match file by index
        return {
          title,
          description: descriptionOrg[index],
          filePath: file?.path || null, // Assign the correct file path
        };
      }) : [
        {
          title: achievementTitleOrg,
          description: descriptionOrg,
          filePath: req.files[0]?.path || null, // Handle single file
        },
      ]);
  
  

      console.log('Mapped Achievements:', achievements);
  

    // Save to database
    const applicationData = {
      formType,
      userType,
      fullName,
      applicantAge,
      applicantGender,
      email,
      phone,
      organizationName,
      ownerName,
      organizationEmail,
      organizationNumber,
      tribeCheckbox: tribeCheckbox === 'on',
      specificAffiliation,
      ndaAccepted: ndaAccepted === 'on',
      achievements,
      referrer: {
        fullName: referrerFullName,
        age: referrerAge,
        gender: referrerGender,
        email: referrerEmail,
        phone: referrerPhone,
        nominationReason,
      },
    };

    const newApplication = new Application(applicationData);
    await newApplication.save();

    // Prepare email content
    const achievementsTableRows = achievements.map((achievement) => `
      <tr>
        <td>${achievement.title}</td>
        <td>${achievement.description}</td>
        <td>${achievement.filePath ? 'Attached' : 'No file'}</td>
      </tr>
    `).join('');


    const emailContent = `
    <h2 style="font-family: GraphikWide-Thin,sans-serif; color: #333; text-align:center;">New Application Received</h2>
  
    <h3 style="font-family: GraphikWide-Thin,sans-serif; color: #007BFF; text-align:center;">معلومات عامة/General Information</h3>
    <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; margin-bottom: 20px; text-align:center;">
      <tr style="background-color: #f4f4f4;">
        <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">نوع النموذج/Form Type</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${formType || 'N/A'}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">نوع المستخدم/User Type</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${userType || 'N/A'}</td>
      </tr>
      <tr style="background-color: #f4f4f4;">
        <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">اسم مقدم الطلب/Applicant Name</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${fullName || 'N/A'}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">عمر مقدم الطلب/Applicant Age</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${applicantAge || 'N/A'}</td>
      </tr>

      <tr style="background-color: #f4f4f4;">
        <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">جنس مقدم الطلب/Applicant Gender</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${applicantGender || 'N/A'}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">البريد الإلكتروني/Email</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${email || 'N/A'}</td>
      </tr>
      <tr style="background-color: #f4f4f4;">
        <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">رقم جوال/Phone</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${phone || 'N/A'}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;"> حدد الانتماء/Specific Affiliation</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${specificAffiliation || 'N/A'}</td>
      </tr>
    </table>
  
    ${formType === 'organization' ? `
      <h3 style="font-family: GraphikWide-Thin,sans-serif; color: #007BFF; text-align:center;">معلومات عن المؤسسة/Organization Details</h3>
      <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; margin-bottom: 20px; text-align:center;">
        <tr style="background-color: #f4f4f4;">
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">اسم الكيان/Organization Name</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${organizationName || 'N/A'}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">نوع الكيان وملكيته/Owner Name</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${ownerName || 'N/A'}</td>
        </tr>
        <tr style="background-color: #f4f4f4;">
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">البريد الالكتروني للكيان/Organization Email</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${organizationEmail || 'N/A'}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">رقم جوال التواصل/Organization Phone</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${organizationNumber || 'N/A'}</td>
        </tr>
      </table>
    ` : ''}
  
    ${userType === 'referral' ? `
      <h3 style="font-family: GraphikWide-Thin,sans-serif; color: #007BFF;">بيانات من قام بترشيح شخص آخر/Referrer Details</h3>
      <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; margin-bottom: 20px;">
        <tr style="background-color: #f4f4f4;">
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">اسمك الرباعي كامل/Referrer Name</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${referrerFullName || 'N/A'}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">العمر (السنوات)/Referrer Age</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${referrerAge || 'N/A'}</td>
        </tr>
        <tr style="background-color: #f4f4f4;">
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">الجنس/Referrer Gender</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${referrerGender || 'N/A'}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">البريد الإلكتروني/Referrer Email</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${referrerEmail || 'N/A'}</td>
        </tr>
        <tr style="background-color: #f4f4f4;">
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">رقم الجوال/Referrer Phone</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${referrerPhone || 'N/A'}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; text-align:center;">مسوغات الترشيح/Reason for Nomination</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${nominationReason || 'N/A'}</td>
        </tr>
      </table>
    ` : ''}
  
    <h3 style="font-family: GraphikWide-Thin,sans-serif; color: #007BFF;">Achievements</h3>
    <table style="width: 100%; border-collapse: collapse; font-family: GraphikWide-Thin,sans-serif; margin-bottom: 20px;">
      <tr style="background-color: #007BFF; color: #fff; text-align:center;">
        <th style="border: 1px solid #ddd; padding: 8px; text-align:center;">العنوان/Title</th>
        <th style="border: 1px solid #ddd; padding: 8px; text-align:center;">الوصف/Description</th>
        <th style="border: 1px solid #ddd; padding: 8px; text-align:center;">File</th>
      </tr>
      ${achievements.map((achievement, index) => `
        <tr style="${index % 2 === 0 ? 'background-color: #f4f4f4;' : ''}">
          <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${achievement.title}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${achievement.description}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align:center;">${achievement.filePath ? 'ملف مرفق/File Attached' : 'No file Attached'}</td>
        </tr>
      `).join('')}
    </table>
  `;

  //attachments

    const attachments = achievements
      .filter((achievement) => achievement.filePath)
      .map((achievement) => ({
        filename: path.basename(achievement.filePath),
        path: achievement.filePath,
      }));

    const mailOptions = {
      from: process.env.OUTLOOK_EMAIL,
      to: 'info@aqeaw.com',
      subject: 'New Application Submitted',
      html: emailContent,
      attachments,
    };

    // Send email
    transporter.sendMail(mailOptions, async (error, info) => {
      if (error) {
        console.error('Email send error:', error);
        return res.status(500).send({ message: 'Application saved, but email notification failed.' });
      }

      console.log('Email sent: ' + info.response);
      res.status(200).send(`
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    ">
      <div style="
        position: relative;
        background-color: #ffffff;
        padding: 30px;
        text-align: center;
        border-radius: 12px;
        font-family: 'Arial', sans-serif;
        box-shadow: 0px 4px 20px rgba(0, 0, 0, 0.15);
        max-width: 500px;
        width: 90%;
        animation: fadeIn 0.3s ease-out;
      ">
        <div style="
          position: absolute;
          top: 10px;
          right: 10px;
          cursor: pointer;
          font-size: 18px;
          font-weight: bold;
          color: #555;
        " onclick="document.querySelector('.overlay-container').style.display='none'">&times;</div>
        
        <h2 style="
          color: #28a745;
          font-size: 24px;
          margin-bottom: 15px;
        ">Application Submitted Successfully!</h2>
        
        <p style="
          color: #333;
          font-size: 16px;
          margin-bottom: 20px;
        ">Your application has been received. The form will reset shortly.</p>
        
        <div style="
          width: 100%;
          text-align: center;
        ">
          <button style="
            padding: 10px 20px;
            background-color: #28a745;
            color: #ffffff;
            font-size: 16px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.2s ease-in-out;
          " onclick="window.location.href = 'https://aqeaw.com/pages/how-to-apply'">OK</button>
        </div>
      </div>
    </div>
    
    <style>
      @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }
    </style>
    
    <script>
      setTimeout(() => {
        window.location.href = 'https://aqeaw.com/pages/how-to-apply';
      }, 3000);
    </script>
  `);

      const cleanupFiles = async () => {
        try {
          for (const file of req.files['upload[]'] || []) {
            await fs.promises.unlink(file.path);
          }
          for (const file of req.files['uploadOrg[]'] || []) {
            await fs.promises.unlink(file.path);
          }
        } catch (err) {
          console.error('Error cleaning up files:', err);
        }
      };

      await cleanupFiles(); // Cleanup files
    });
  } catch (error) {
    console.error('Error processing application:', error);
    res.status(500).send({ message: 'An error occurred during submission.', error: error.message });
  }
});


// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Database connected successfully!'))
  .catch(err => {
    console.error('Database connection error:', err);
    process.exit(1);
  });

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
