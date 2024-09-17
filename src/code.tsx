import nodemailer from 'nodemailer';

export const generateOtpEmailHtml = (otpCode: string) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        /* Inline CSS styles */
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f4f4f4;
            color: #333;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #ffffff;
            border-radius: 5px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            padding: 10px 0;
        }
        .otp-code {
            font-size: 24px;
            font-weight: bold;
            color: #007bff;
            text-align: center;
            margin: 20px 0;
        }
        .message {
            text-align: center;
            line-height: 1.5;
        }
        .footer {
            text-align: center;
            font-size: 12px;
            color: #777;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Your OTP Code</h2>
        </div>
        <div class="message">
            <p>Please use the following OTP code to verify your email address:</p>
            <div class="otp-code">${otpCode}</div>
            <p>This code will expire in 10 minutes.</p>
        </div>
        <div class="footer">
            <p>If you did not request this code, please ignore this email.</p>
        </div>
    </div>
</body>
</html>
`;



export const sendOtpEmail = async (recipientEmail: string, otpCode: string) => {
    // Create a Nodemailer transporter
    const transporter = nodemailer.createTransport({
       host :  'smtp.mailbit.io',
       port : 587,
       secure : false,
       auth :{
        user : 'user-ee62e7e6a835dfc8',
        pass : 'h2Vojij8YG2w0W2aqYKPLoeztQC9'
       }
    });

    // Set up the email options
    const mailOptions = {
        from: 'noreply@mdrijonhossainjibonyt.xyz',
        to: recipientEmail,
        subject: 'Your OTP Code',
        html: generateOtpEmailHtml(otpCode)
    };

    // Send the email
    try {
       return await transporter.sendMail(mailOptions);
        console.log('OTP email sent successfully');
    } catch (error) {
        console.error('Error sending OTP email:', error);
    }
};