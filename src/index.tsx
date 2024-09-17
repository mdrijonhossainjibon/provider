import TelegramBot, { InlineKeyboardButton, InlineKeyboardMarkup, Message } from 'node-telegram-bot-api';
import dotenv from 'dotenv';
 
import User, { Channel, Config, IUser, WithdrawalHistory } from './models'; // Import the User model
import mongoose from 'mongoose';
import qrcode from 'qrcode';
import { API_CALL } from 'API_CALL';
dotenv.config();
import rateLimit from 'express-rate-limit';
import express from 'express';
 

const referralBonuses = [0.02, 0.000001, 0.000001, 0.000005, 0.001]; // 30%, 20%, 10%, 5%, 1%
const referralBonusUSDC = 1; // USDC reward per referral

 
const userPreviousMessages: any = {};

const adminStates: { [key: string]: string } = {};

async function getConfig() {
    let config = await Config.findOne();
    if (!config) {
        config = new Config({ paymentKey: '' });
        await config.save();
    }
    return config;
}

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI as string) .then(() => console.log('MongoDB connected'))  .catch((err: any) => console.error('MongoDB connection error:', err));

const app = express();
const PORT = 3000;

app.use(express.json());

const createAccountLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 3000000, // limit each IP to 3 create account re    quests per windowMs
    message: 'Too many requests from this IP, please try again after 1s',
});

async function sendWelcomeMessage(user: any) {
    const welcomeMessage = `Welcome, ${user.username}! 🎉\n\nThank you for creating an account. We're excited to have you on board! Enjoy your welcome bonus of 0.020 USDT and start exploring our services. 😊`;
    user.bonus = (user.bonus || 0) + 0.020;
    await user.save();
   await bot.sendMessage(user.userId, welcomeMessage);

    // Assuming deleteMessage is a function provided by the bot API to delete messages
    setTimeout(async () => {
        //await bot.deleteMessage(user.userId, sentMessage.message_id);
    }, 5000); // 5000 milliseconds = 5 seconds
}

app.post('/create-account', createAccountLimiter, async (req, res: any) => {
    try {
        const ip = req.ip;
        const { referrerId, userId, username } = req.body;

        if (!username || typeof username !== 'string' || username.trim().length === 0) {
            throw new Error('Username not set');
        }

        const existingUserByIp = await User.findOne({ ipAddress: ip });
        if (existingUserByIp) {
            // return res.status(429).json({ success: false, message: 'Multiple accounts from the sa me IP address are not allowed. You have been banned.' });
        }

        if (userId) {
            let existingUser = await User.findOne({ userId });

            if (existingUser?.status === 'ban') {
                return res.status(404).json({ success: false, message: 'User banned. Account is not allowed.' });
            }
            if (!existingUser) {
                if (referrerId) {
                    const existingReferrer = await User.findOne({ userId: referrerId });
                    if (!existingReferrer) {
                        return res.status(404).json({ success: false, message: 'Referral code not found or user banned.', referrerId });
                    }
                    existingUser = new User({ userId, username, referrerId, ipAddress: ip, bonus: 0.00 });
                    await existingUser.save();
                    await sendWelcomeMessage(existingUser);
                    // If there is a referrer, increment their referral count and handle bonuses
                    await handleReferralBonus(referrerId, 0); // Start with level 1
                    referralMap.delete(userId);
                    return res.status(201).json({ success: true, message: 'Account creation successful.' });
                }
                existingUser = new User({ userId, username, ipAddress: ip, bonus: 0.00 });
                await existingUser.save();
                await sendWelcomeMessage(existingUser);
                referralMap.delete(userId);
                return res.status(201).json({ success: true, message: 'Account creation successful.' });
            }
            if (existingUser) {
                return res.status(201).json({ success: true, message: 'Login successful.' });
            }
        }

        return res.status(201).json({ success: false, message: 'Login unsuccessful.' });

    } catch (error: any) {

        return res.status(500).json({ success: false, message: error.message });
    }
});

const token = process.env.TELEGRAM_BOT_TOKEN as string || '7225380221:AAEUo8B-szHox0ChqFLlkRVTi8O_Z7Gu0QE';
const bot = new TelegramBot(token, { polling: true });

const photoUrl = 'https://ibb.co/fqpXCMP';

let referralMap = new Map<number, number>();


const admins: number[] = [709148502, 1997564705];
interface BroadcastContent {
    type: 'text' | 'photo' | 'forward';
    content?: string;
    photo?: TelegramBot.PhotoSize[];
    caption?: string;
    messageId?: number;
}
// Store the broadcast messages temporarily
const pendingBroadcasts: { [key: number]: BroadcastContent } = {};

let totall: number = 0;

bot.onText(/\/b/, (msg: Message) => {
    const chatId = msg.chat.id;

    if (admins.includes(chatId)) {
        bot.sendMessage(chatId, 'Please enter the message you want to broadcast or forward a message:').then(sentMessage => {
            bot.onReplyToMessage(sentMessage.chat.id, sentMessage.message_id, (reply: Message) => {
                let broadcastContent: BroadcastContent = { type: 'text' };

                if (reply.text) {
                    broadcastContent = { type: 'text', content: reply.text };
                } else if (reply.photo) {
                    broadcastContent = { type: 'photo', photo: reply.photo, caption: reply.caption || '' };
                } else if (reply.forward_from_message_id) {
                    broadcastContent = { type: 'forward', messageId: reply.forward_from_message_id };
                }

                pendingBroadcasts[chatId] = broadcastContent;

                const previewMessage = broadcastContent.type === 'text' ? broadcastContent.content : (broadcastContent.caption || 'Photo message');
                bot.sendMessage(chatId, `Are you sure you want to broadcast the following message?\n\n"${previewMessage}"\n\nReply with "yes" to confirm or "no" to cancel.`);
            });
        });
    } else {
        bot.sendMessage(chatId, 'You are not authorized to broadcast messages.');
    }
});



const MAX_RETRIES = 5; // Maximum number of retries for rate limiting
const RETRY_DELAY = 60000; // Delay in milliseconds (60 seconds)

const sendPhotoWithRetry = async (subscriber: IUser, broadcastContent: any, retries = 0) => {
    try {
        totall += 1;
        await bot.sendPhoto(subscriber.userId, broadcastContent.photo[broadcastContent.photo.length - 1].file_id, {
            caption: broadcastContent.caption ? broadcastContent.caption : undefined,
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Contact Us', url: 'http://t.me/mdrijonhossainjibon' }, { text: 'Visit Website', url: 'http://mdrijonhossainjibon.xyz/' }],
                    [{ text: '↩️ Back', callback_data: 'menu' }]
                ]
            }
        });
    } catch (error: any) {
        if (error.response && error.response.statusCode === 429 && retries < MAX_RETRIES) {
            // Handle rate limit error
            const retryAfter = error.response.parameters.retry_after || RETRY_DELAY;
            console.warn(`Rate limit exceeded. Retrying after ${retryAfter} ms...`);

            await new Promise(resolve => setTimeout(resolve, retryAfter));
            await sendPhotoWithRetry(subscriber, broadcastContent, retries + 1);
        } else {

        }
    }
};

async function sendMessageWithRetry(subscriber: IUser, broadcastContent: any, retries = 0) {
    try {
        totall += 1;
        await bot.sendMessage(subscriber.userId, broadcastContent.text);
    } catch (error: any) {
        if (error.response && error.response.statusCode === 429 && retries < MAX_RETRIES) {
            // Handle rate limit error
            const retryAfter = error.response.parameters.retry_after || RETRY_DELAY;
            console.warn(`Rate limit exceeded. Retrying after ${retryAfter} ms...`);

            await new Promise(resolve => setTimeout(resolve, retryAfter));
            await sendMessageWithRetry(subscriber, broadcastContent, retries + 1);
        } else {
            throw error; // Re-throw the error if it's not a rate limit error or retries exceeded
        }
    }
}

bot.onText(/^(yes|no)$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const confirmation = match ? match[1].toLowerCase() : '';

    if (admins.includes(chatId) && pendingBroadcasts[chatId]) {
        if (confirmation === 'yes') {
            try {
                const broadcastContent = pendingBroadcasts[chatId];
                const subscribers = await User.find();


                let sendPromises;
                if (broadcastContent.type === 'text') {
                    sendPromises = subscribers.map(subscriber => sendMessageWithRetry(subscriber, broadcastContent));
                } else if (broadcastContent.type === 'photo') {
                    sendPromises = subscribers.map(subscriber => sendPhotoWithRetry(subscriber, broadcastContent));
                } else {
                    throw new Error('Unsupported content type');
                }

                await Promise.all(sendPromises);

                await Promise.all(sendPromises);
                await bot.sendMessage(chatId, 'Message broadcasted successfully.');
            } catch (error) {
                await bot.sendMessage(chatId, 'An error occurred while broadcasting the message.');
            }
        } else if (confirmation === 'no') {
            await bot.sendMessage(chatId, 'Broadcast cancelled.');
        }

        // Clear the pending broadcast message
        delete pendingBroadcasts[chatId];
    }
});


bot.onText(/\/start(?:\s+(\d+))?/, async (msg: Message, match: RegExpExecArray | null) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const username = msg.from?.username;
    const referrerId = match && match[1] ? parseInt(match[1]) : null;

    try {
        if (userId && referrerId) {
            referralMap.set(userId, referrerId);
        }

        if (!userId) {
            const message = await bot.sendMessage(chatId, 'User ID not found. Please try again later.');
            return userPreviousMessages[chatId] = message.message_id;
        }


        const channelUsernames = await Channel.find();

        if (channelUsernames.length === 0 && !admins.includes(chatId)) {

            const message = await bot.sendPhoto(userId, 'https://ibb.co/0KB4TMb', {
                caption: '🚫 No channels found. Please add a channel first.',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '↩️ Back', callback_data: 'menu' }, { text: '➕ Add Channel', callback_data: 'add_channel' }
                        ]
                    ]
                }
            });
            return userPreviousMessages[userId] = message.message_id;

        }
        const joinedChannels = await Promise.all(
            channelUsernames.map(channel => isUserInChannel(userId, channel.username))
        );

        const inlineKeyboard: InlineKeyboardMarkup = {
            inline_keyboard: [
                ...channelUsernames.map((channel, index) => {
                    const joined = joinedChannels[index];
                    return { text: `Join Channel ${joined ? '✅' : '❌'}`, url: channel.url };
                }).reduce((rows: any[], button: any, index: number) => {
                    if (index % 2 === 0) rows.push([button]);
                    else rows[rows.length - 1].push(button);
                    return rows;
                }, []),
                [{ text: '✌️ Claim Your USDT', callback_data: 'claim_usdc' }]
            ]
        };


        if (joinedChannels.some(joined => !joined)) {
            if (userId) {
                const message = await bot.sendPhoto(userId, photoUrl, {
                    caption: `Hi <b>@${username}</b> ✌️\nWelcome to <b>$USDT Airdrop</b>\n\nAn Amazing Bot Ever Made for Online Earning lovers. Earn Unlimited <b>$USDT</b>`,
                    parse_mode: 'HTML',
                    reply_markup: inlineKeyboard
                });
                return  userPreviousMessages[chatId] = message.message_id;
            }
            return;
        }

        const { response } = await API_CALL({ url: '/create-account', body: { userId, referrerId: referralMap.get(userId) ?? null, username }, method: 'post' });
        if (response?.success) {
            setTimeout(async () => {
                try {
                    if (userId) {
                         
                        const message =  await bot.sendPhoto(userId, 'https://ibb.co/h1phDbr', {
                            caption: `Hi <b>@${msg.chat.username}</b> ✌️\nThis is Earning Bot. Welcome to Ton Network App. An Amazing App Ever Made for Online Earning lovers.`,
                            parse_mode: 'HTML', reply_markup: keyboard
                        });
                        return  userPreviousMessages[chatId] = message.message_id;
                    }
                } catch (err) {

                }
            }, 5500);
        } else {
            const message = await bot.sendPhoto(chatId, 'https://ibb.co/0KB4TMb', { caption: response?.message as string });
            return  userPreviousMessages[chatId] = message.message_id;
        }
    } catch (err) {
    }
});


async function isUserInChannel(userId: number, username: string): Promise<boolean> {
    try {
        const member = await bot.getChatMember(username, userId);
        return member.status !== 'left';
    } catch (error: any) {
        if (error.code === 403) {
            return false;
        } else {
            return false;
        }
    }
}


async function handleReferralBonus(referrerId: number, level: number) {
    if (level >= referralBonuses.length) return; // Stop if level exceeds defined levels

    const referrer = await User.findOne({ userId: referrerId });
    if (!referrer) return;

    referrer.referralCount = (referrer.referralCount || 0) + 1;

    // Calculate and add bonus
    const bonus = referralBonusUSDC * referralBonuses[level];
    referrer.bonus = (referrer.bonus || 0) + bonus;
    await referrer.save();

    if (level === 0) {
        return bot.sendMessage(referrer.userId, `🎉 You have a new referral!  You earned a bonus of ${bonus} USDT!`);
    }
    bot.sendMessage(referrer.userId, `🎉 You have a new level ${level + 1} referral!  You earned a bonus of ${bonus} USDT!`);
    // If the referrer has their own referrer, handle the next level
    if (referrer.referrerId) {
        await handleReferralBonus(referrer.referrerId, level + 1);
    }
}

async function handleReferral(msg: TelegramBot.Message, userId?: number) {
    const chatId = msg.chat.id;

    if (!userId) {
        const message = await bot.sendMessage(chatId, 'User ID not found. Please try again later.');
        return  userPreviousMessages[chatId] = message.message_id;
    }

    try {
        const user = await User.findOne({ userId });

        if (user) {
            const referralLink = `https://t.me/RR0024_bot?start=${userId}`;

            // Generate QR code
            const qrCodeImage = await qrcode.toDataURL(referralLink, { type: 'image/png' });

            // Convert data URL to Buffer
            const qrCodeBuffer = Buffer.from(qrCodeImage.split(',')[1], 'base64');

            const keyboard: InlineKeyboardButton[][] = [
                [{ text: '↩️ Back', callback_data: 'menu' }],
            ];

            const caption = `*👫 Your Referral Information*\n\n` +
                `🔗 Your Referral Link: \`${referralLink}\`\n\n` +
                `*▪️ Your Total Referrals:* \`${user.referralCount || 0} Users\`\n\n` +
                `*👫 Per Referral \`0.02 $USDT\` - Share Your referral link with your friends & earn unlimited \`$USDT\`*\n\n` +
                `*⚠️ Note:* Fake, empty, or spam users are deleted after checking.`;


            // Send photo with caption including emojis
            const message = await bot.sendPhoto(chatId, qrCodeBuffer, {
                caption,
                reply_markup: { inline_keyboard: keyboard },
                parse_mode: 'Markdown'
            });
           return userPreviousMessages[chatId] = message.message_id;
        } else {
            await bot.sendMessage(chatId, 'User not found. Please start the bot first by sending /start.');
        }
    } catch (error: any) {
   
    }
}


const keyboard = {
    inline_keyboard: [
        [
            { text: '💰 Account Balance', callback_data: 'account_balance' },
            { text: '📩 Invite', callback_data: 'invite' },
        ],
        [
            { text: '💸 Withdrawal', callback_data: 'withdrawal' },
            { text: '📊 Statistics', callback_data: 'statistics' },
        ],
        [
            { text: '🕒 History', callback_data: 'history' }, { text: '↩️ Back', callback_data: 'menu' }
        ]
    ]
};




async function AccountBalance(msg: TelegramBot.Message, userId?: any) {
    const chatId = msg.chat.id;

    try {
        if (!userId) {
            throw new Error('User ID not found.');
        }

        const userDetails = await User.findOne({ userId });

        if (!userDetails) {
            throw new Error('User details not found.');
        }

        const messages = `🕵️‍♂️ Name: ${userDetails.username}\n\n` +
            `🆔 User Id: ${userDetails.userId}\n\n` +
            `💵 Balance: ${userDetails.bonus.toFixed(2)} $ USDT\n\n` +
            `$USDT Address: ${userDetails.userId}\n` +
            `Not Create Xrocket Wallet? Then First Create Wallet👉 [Create Wallet](https://t.me/xrocket?start=mci_G2m7TBpnA8DanfM)\n\n` +
            `👫 Refer And Earn More $USDT\n\n` +
            `💳 Minimum Redeem: 0.20 $ USDT`;

        // Assuming you have a publicly accessible URL for the photo
        const photoUrl = 'https://ibb.co/TbnZv2d';

        const keyboard: InlineKeyboardButton[][] = [
            [
                { text: '📢 All Updated Channels', url: 'https://t.me/OnlineEarning24RIYAD' },
                { text: '📈 Live Charting Channel', url: 'https://t.me/RiyadRana' },
            ],
            [
                { text: '↩️ Back', callback_data: 'menu' },
            ]
        ];


        // Send photo with caption and markdown parsing
        const message = await bot.sendPhoto(chatId, photoUrl, {
            parse_mode: 'Markdown',
            caption: messages, reply_markup: { inline_keyboard: keyboard },
            disable_notification: true // Optional: Disable notification for this message
        });

        userPreviousMessages[userId] = message.message_id;

    } catch (error: any) {
     
    }
}

async function getStatistics(msg: TelegramBot.Message, userId?: number) {
    const chatId = msg.chat.id;

    try {
        if (!userId) {
            throw new Error('User ID not found.');
        }
        const totalMembers = await User.countDocuments();
        let totalPayouts = (await WithdrawalHistory.find({}))
            .reduce((total, record) => total + record.amount, 0);



        let statisticsMessage = `📊 Statistics 📊\n\n`;
        statisticsMessage += `👥 Total members: ${totalMembers} Users\n`;
        statisticsMessage += `💵 Total Payouts: ${totalPayouts.toPrecision(5)} $USDT`;

        // Example keyboard for Telegram inline buttons
        const keyboard = [
            [
                { text: 'Subscribe', url: 'https://www.youtube.com/channel/UCVnK6wLj7ix_laFyuiAA3yg' }, { text: 'Deploy Bot Contact', url: 'https://t.me/MdRijonHossainJibon' },
            ],
            [
                { text: '↩️ Back', callback_data: 'menu' },
            ]
        ];


        // Assuming `bot` is your Telegram bot instance (replace with your actual bot instance)
       const message = await bot.sendPhoto(chatId, 'https://ibb.co/6Hp9vxb', {
            caption: statisticsMessage,
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML' as const // Specify 'HTML' as const to prevent type errors
        });
        userPreviousMessages[userId] = message.message_id;
    } catch (error: any) {
        await bot.sendPhoto(chatId, 'https://ibb.co/0KB4TMb', { caption: error.message });
    }
}






async function handleWithdrawal(msg: TelegramBot.Message, userId: number) {
    const chatId = msg.chat.id;


    try {

        if (userPreviousMessages[userId]) {
            try {
                await bot.deleteMessage(chatId, userPreviousMessages[userId].toString() as any);
            } catch (error) {

            }
        }

        // Indicate typing action
        await bot.sendChatAction(chatId, 'typing');

        const message = await bot.sendMessage(chatId, 'Please select your withdrawal amount:', {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '💵 0.2 USDT', callback_data: 'withdraw_0.2' },
                        { text: '💵 0.4 USDT', callback_data: 'withdraw_0.4' }
                    ],
                    [
                        { text: '💵 0.5 USDT', callback_data: 'withdraw_0.5' },
                        { text: '💵 0.6 USDT', callback_data: 'withdraw_0.6' }
                    ],
                    [
                        { text: '💵 0.8 USDT', callback_data: 'withdraw_0.8' },
                        { text: '💰 1 USDT', callback_data: 'withdraw_1' }
                    ],
                    [
                        { text: '💸 2 USDT', callback_data: 'withdraw_2' }
                    ],
                    [
                        { text: '↩️ Back', callback_data: 'menu' }
                    ]
                ]
            }
        });

        userPreviousMessages[userId] = message.message_id;


    } catch (error: any) {
        await bot.sendPhoto(chatId, 'https://ibb.co/0KB4TMb', {
            caption: `${error.message}`,
            reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'menu' }]] }
        });
    }
}






async function Promote_Your_Telegram(msg: TelegramBot.Message, userId: number) {
    try {
        const chatId = msg.chat.id;

        // Formatted message with Markdown syntax and emojis
        const messagetext = `Hi ${msg.chat.username ? msg.chat.username : null}, this is the Promote Page.\n\n🔥 Hello Dear,\nPromote your Telegram Channel or Group and your social media presence.\nGrow your YouTube channel subscribers by contacting the admin. 🤩`;

        // Inline keyboard with URLs
        const inline_keyboard = [
            [
                { text: 'Visit YouTube', url: 'https://www.youtube.com/' },
                { text: 'Join Telegram', url: 'https://t.me/OnlineEarning24RIYAD' }
            ],
            [{ text: '↩️ Back', callback_data: 'menu' }]
        ];

        // Send the photo with the formatted message as caption and inline keyboard
        const message = await bot.sendPhoto(chatId, 'https://i.ibb.co/Mn5Nm96/photo.jpg', {
            caption: messagetext,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard }
        });

        userPreviousMessages[userId] = message.message_id;

    } catch (error) {

    }
}







async function canWithdrawToday(userId: number): Promise<boolean> {
    // Get the start of the current day
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Get the end of the current day
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Query the database for any withdrawals made by the user today
    const existingWithdrawal = await WithdrawalHistory.findOne({
        userId,
        date: {
            $gte: startOfDay,
            $lt: endOfDay,
        },
        status: { $in: ['success', 'pending'] }
    });

    // If an existing withdrawal is found, return false, otherwise true
    return !existingWithdrawal;
}

 


const statuses = {
    pending: '🕒 Pending',
    success: '✅ Success',
    fail: '❌ Failed'
};

async function sendWithdrawalHistory(chatId: number) {
    try {
        // Fetch withdrawal history (adjust query if needed)
        const history = await WithdrawalHistory.find({ userId: chatId });

        if (history.length === 0) {
            const message =  await bot.sendMessage(chatId, 'No withdrawal history available.');
            return userPreviousMessages[chatId] = message.message_id
        }

        // Construct messages with status and emojis
        const maxMessageLength = 4000; // Leave some buffer below the limit of 4096
        let message = '📜 *Withdrawal History*:\n\n';
        const messages = [];

        history.forEach((record, index) => {
            const status = statuses[record.status] || 'Unknown';
            const recordMessage = `#${index + 1}\n` +
                `Amount: ${record.amount}\n` +
                `Status: ${status}\n\n`;

            // Check if adding this record will exceed the max length
            if ((message + recordMessage).length > maxMessageLength) {
                // If it does, push the current message to the messages array
                messages.push(message);
                // Start a new message
                message = '📜 *Withdrawal History* (continued):\n\n' + recordMessage;
            } else {
                // Otherwise, add the record to the current message
                message += recordMessage;
            }
        });

        // Add the last message
        messages.push(message);

        // Send each message part
        for (const msg of messages) {
            const message = await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'menu' }]] } });
            return userPreviousMessages[chatId] = message.message_id
        }
    } catch (error) {

    }
}




async function refundUser(userId: string, amount: number) {
    try {

        if (userPreviousMessages[userId]) {
            try {
                await bot.deleteMessage(userId, userPreviousMessages[userId].toString() as any);
            } catch (error) {

            }
        }
        // Fetch the user by ID
        const user = await User.findOne({ userId });
        if (!user) {
            const message = await bot.sendMessage(userId, '❌ User not found.');
            return userPreviousMessages[userId] = message.message_id
        }

        // Update the user's balance
        user.bonus += amount; // Assuming the balance is stored as a number
        await user.save();

        // Notify the user about the refund
        const message = await bot.sendMessage(userId, `💵 Refund successful! An amount of ${amount} has been added to your account.`);
        return userPreviousMessages[userId] = message.message_id
    } catch (error) {
       
    }
}



bot.on('message', async (msg) => {
    try {
        const userId = msg.chat.id;
        const text = msg.text;
        const config = await getConfig();


        if (userPreviousMessages[userId]) {
            try {
                await bot.deleteMessage(userId, userPreviousMessages[userId].toString() as any);
            } catch (error) {

            }
        }
        if (config.toggle_bot_off && !admins.includes(userId)) {
            const message = await bot.sendPhoto(userId, 'https://ibb.co.com/j5sb32d', {
                caption: '⚙️ Bot is currently in maintenance mode. Please try again later.',
                reply_markup: {
                    keyboard: [[{ text: '↩️ Back' }]],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
            return userPreviousMessages[userId] = message.message_id
        }

        const startCommandRegex = /^\/start(?:\s+(\d+))?$/;

        if (text === '/start') return;

        if (text === '/admin') {
            if (!admins.includes(userId)) {
                // Only allow the specified admin to use this command
                const messages = await bot.sendMessage(userId, '🚫 You are not authorized to use this command.');
                return userPreviousMessages[userId] = messages.message_id
            }
            const { inline_keyboard } = await getChannelManagementKeyboard();

            const messages = await bot.sendMessage(userId, '🛠️ Admin Panel', { reply_markup: { inline_keyboard } });
            return userPreviousMessages[userId] = messages.message_id
        }


        if (text === '↩️ Back') {
            const messages = await bot.sendPhoto(userId, 'https://ibb.co/h1phDbr', {
                caption: `Hi <b>@${msg.chat.username}</b> ✌️\nThis is Earning Bot. Welcome to Ton Network App. An Amazing App Ever Made for Online Earning lovers.`,
                parse_mode: 'HTML', reply_markup: keyboard
            });
            return userPreviousMessages[userId] = messages.message_id
        }


        if (msg.forward_date && admins.includes(userId)) {
            try {
                const subscribers = await User.find();

                // Determine the type of the forwarded message
                if (msg.text) {
                    // Forwarded text message
                    const sendPromises = subscribers.map(subscriber => sendMessageWithRetry(subscriber, { text: msg.text }));
                    await Promise.all(sendPromises);
                } else if (msg.photo) {
                    // Forwarded photo message
                    const photo = msg.photo[msg.photo.length - 1].file_id; // Get the highest resolution photo
                    const caption = msg.caption || '';
                    const sendPromises = subscribers.map(subscriber => sendPhotoWithRetry(subscriber, { photo, caption }));
                    await Promise.all(sendPromises);
                } else {
                    throw new Error('Unsupported forwarded message type');
                }

                await bot.sendMessage(userId, 'Message forwarded to all subscribers successfully.');
            } catch (error) {

            }
        }

        // Check if the message matches the /start command pattern
        if (startCommandRegex.test(text as string)) {
            // Extract the numeric parameter if present
            const match = startCommandRegex.exec(text as string);
            const numericParam = match && match[1] ? parseInt(match[1], 10) : undefined;
            if (numericParam) return;
        }

        let existingUser = await User.findOne({ userId });

        if (existingUser?.status === 'ban') {
            const messages = await bot.sendPhoto(userId, 'https://ibb.co/DzCpqgR', { caption: `User banned. Account is not allowed.` })
            return userPreviousMessages[userId] = messages.message_id
        }



        const channelUsernames = await Channel.find();

        if (channelUsernames.length === 0 && !admins.includes(userId)) {

            const message = await bot.sendPhoto(userId, 'https://ibb.co/0KB4TMb', {
                caption: '🚫 No channels found. Please add a channel first.',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '↩️ Back', callback_data: 'menu' }, { text: '➕ Add Channel', callback_data: 'add_channel' }
                        ]
                    ]
                }
            });
            return userPreviousMessages[userId] = message.message_id;

        }
        const joinedChannels = await Promise.all(
            channelUsernames.map(channel => isUserInChannel(userId, channel.username))
        );

        const inlineKeyboard: InlineKeyboardMarkup = {
            inline_keyboard: [
                ...channelUsernames.map((channel, index) => {
                    const joined = joinedChannels[index];
                    return { text: `Join Channel ${joined ? '✅' : '❌'}`, url: channel.url };
                }).reduce((rows: any[], button: any, index: number) => {
                    if (index % 2 === 0) rows.push([button]);
                    else rows[rows.length - 1].push(button);
                    return rows;
                }, []),
                [{ text: '✌️ Claim Your USDT', callback_data: 'claim_usdc' }]
            ]
        };


        if (joinedChannels.some(joined => !joined && !admins.includes(userId))) {
            if (userId) {
                const message = await bot.sendPhoto(userId, photoUrl, {
                    caption: `Hi <b>@${msg.chat.username || ''}</b> ✌️\nWelcome to <b>$USDT Airdrop</b>\n\nAn Amazing Bot Ever Made for Online Earning lovers. Earn Unlimited <b>$USDT</b>`,
                    parse_mode: 'HTML',
                    reply_markup: inlineKeyboard
                });
                return userPreviousMessages[userId] = message.message_id;

            }

        }


    } catch (error: any) {
    }
});




 



bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const userId = callbackQuery.from.id;

    if (!msg) return;

    try {
        let existingUser = await User.findOne({ userId });
        const data = callbackQuery.data || '';

        const config = await getConfig();

        if (userPreviousMessages[userId]) {
            try {
                await bot.deleteMessage(userId, userPreviousMessages[userId].toString() as any);
            } catch (error) {

            }
        }

        if (config.toggle_bot_off && !admins.includes(userId)) {
            const message = await bot.sendPhoto(userId, 'https://ibb.co.com/j5sb32d', {
                caption: '⚙️ Bot is currently in maintenance mode. Please try again later.',
                reply_markup: {
                    keyboard: [[{ text: '↩️ Back' }]],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
            return userPreviousMessages[userId] = message.message_id
        }


        if (existingUser?.status === 'ban') {
            return await bot.sendPhoto(userId, 'https://ibb.co/DzCpqgR', { caption: `User banned. Account is not allowed.` });
        }

        const channelUsernames = await Channel.find();

        if (channelUsernames.length === 0 && !admins.includes(userId)   ) {

            const message = await bot.sendPhoto(userId, 'https://ibb.co/0KB4TMb', {
                caption: '🚫 No channels found. Please add a channel first.',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '↩️ Back', callback_data: 'menu' }, { text: '➕ Add Channel', callback_data: 'add_channel' }
                        ]
                    ]
                }
            });
            return userPreviousMessages[userId] = message.message_id;

        }
        const joinedChannels = await Promise.all(
            channelUsernames.map(channel => isUserInChannel(userId, channel.username))
        );

        const inlineKeyboard: InlineKeyboardMarkup = {
            inline_keyboard: [
                ...channelUsernames.map((channel, index) => {
                    const joined = joinedChannels[index];
                    return { text: `Join Channel ${joined ? '✅' : '❌'}`, url: channel.url };
                }).reduce((rows: any[], button: any, index: number) => {
                    if (index % 2 === 0) rows.push([button]);
                    else rows[rows.length - 1].push(button);
                    return rows;
                }, []),
                [{ text: '✌️ Claim Your USDT', callback_data: 'claim_usdc' }]
            ]
        };

        if (joinedChannels.some(joined => !joined && !admins.includes(userId))) {
            if (userId) {
               const message = await bot.sendPhoto(userId, photoUrl, {
                    caption: `Hi <b>@${msg.chat.username}</b> ✌️\nWelcome to <b>$USDT Airdrop</b>\n\nAn Amazing Bot Ever Made for Online Earning lovers. Earn Unlimited <b>$USDT</b>`,
                    parse_mode: 'HTML',
                    reply_markup: inlineKeyboard
                });
               return userPreviousMessages[userId] = message.message_id;
            }
           
        }

        if (callbackQuery.data === 'claim_usdc') {
            const { response } = await API_CALL({ url: 'create-account', body: { userId, referrerId: referralMap.get(userId), username: msg.chat.username }, method: 'post' });

            if (response?.success) {
                setTimeout(async () => {
                    const message = await bot.sendPhoto(userId, 'https://ibb.co/h1phDbr', {
                        caption: `Hi <b>@${msg.chat.username}</b> ✌️\nThis is Earning Bot. Welcome to Ton Network App. An Amazing App Ever Made for Online Earning lovers.`,
                        parse_mode: 'HTML', reply_markup: keyboard
                    });
                    return userPreviousMessages[userId] = message.message_id;
                }, 5500);
            } else {
                const message = await bot.sendPhoto(userId, 'https://ibb.co/0KB4TMb', { caption: response?.message as string, reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'menu' }]] } });
                return userPreviousMessages[userId] = message.message_id;
            }
            return;
        }

        if (callbackQuery.data === 'invite') {
            return await handleReferral(msg, userId);
        }

        if (callbackQuery.data === 'account_balance') {
            return await AccountBalance(msg, userId);
        }

        if (callbackQuery.data === 'statistics') {
            return await getStatistics(msg, userId);
        }
        

        if (callbackQuery.data === 'admin_panel') {
            if (!admins.includes(userId)) {
                // Only allow the specified admin to use this command
                const messages = await bot.sendMessage(userId, '🚫 You are not authorized to use this command.');
                return userPreviousMessages[userId] = messages.message_id
            }
            const { inline_keyboard } = await getChannelManagementKeyboard();

            const messages = await bot.sendMessage(userId, '🛠️ Admin Panel', { reply_markup: { inline_keyboard } });
            return userPreviousMessages[userId] = messages.message_id
        }

        if (callbackQuery.data === 'promote') {
            return await Promote_Your_Telegram(msg, userId);
        }

        if (callbackQuery.data === 'history') {
            return await sendWithdrawalHistory(userId);
        }

        if (callbackQuery.data === 'menu') {
            const message = await bot.sendPhoto(userId, 'https://ibb.co/h1phDbr', {
                caption: `Hi <b>@${msg.chat.username}</b> ✌️\nThis is Earning Bot. Welcome to Ton Network App. An Amazing App Ever Made for Online Earning lovers.`,
                parse_mode: 'HTML', reply_markup: keyboard
            });
            return userPreviousMessages[userId] = message.message_id;
        }

         switch (data) {
            case 'add_payment_key':
                adminStates[userId] = 'awaiting_payment_key';
                const message1 = await bot.sendMessage(userId, '🔑 Please provide the new payment key.');
                return userPreviousMessages[userId] = message1.message_id;

            case 'toggle_bot_off':
                adminStates[userId] = 'awaiting_toggle_bot_off';

                // Get and update the configuration
                const config = await getConfig();
                config.toggle_bot_off = !config.toggle_bot_off;
                await config.save();

                // Get the updated keyboard
                const inlineKeyboard = await getChannelManagementKeyboard();
                const message2 = await bot.sendMessage(userId, '🛠️ Admin Panel', {
                    reply_markup: inlineKeyboard // Directly use the inlineKeyboard object
                });

                return userPreviousMessages[userId] = message2.message_id;
            case 'toggle_withdrawals_on':
                adminStates[userId] = 'awaiting_toggle_withdrawals_on';
                const config2 = await getConfig();
                config2.toggle_withdrawals_on = !config2.toggle_withdrawals_on;
                await config2.save();
                const inlineKeyboard2 = await getChannelManagementKeyboard();
                const message3 = await bot.sendMessage(userId, '🛠️ Admin Panel', {
                    reply_markup: inlineKeyboard2// Directly use the inlineKeyboard object
                });
                return userPreviousMessages[userId] = message3.message_id;
            case 'list_channels':
                const channels = await Channel.find()
                const channelList = channels.map((ch, index) => `${index + 1}. ${ch.username} `).join('\n');
                const message4 = await bot.sendMessage(userId, `📜 Current Channels:\n${channelList}`,{ reply_markup : { inline_keyboard : [[{ text: '↩️ Back', callback_data: 'menu' } ,{ text : '👩‍💼 Admin' , callback_data : 'admin_panel'}]]}});
                return userPreviousMessages[userId] = message4.message_id;
            case 'add_channel':
                adminStates[userId] = 'awaiting_add_channel';
                const message5 = await bot.sendMessage(userId, '🔗 Please provide the new channel username and URL in the format: `username, url`.');
                return userPreviousMessages[userId] = message5.message_id;
            case 'refund':
                adminStates[userId] = 'awaiting_add_refund';
                const message6 = await bot.sendMessage(userId, 'Please enter the User ID , amount , symbol (e.g., USD) for the refund:');
                return userPreviousMessages[userId] = message6.message_id;
                case 'remove_channel' : 
                const channels1 = await Channel.find()
                const channelList1 = channels1.map((ch, index) => `${index + 1}. ${ch.username}`).join('\n');
                const message7 = await bot.sendMessage(userId, `❌ Select the channel to remove:\n${channelList1}`, {
                    reply_markup: {
                        inline_keyboard: channels1.map((ch, index) => [
                            { text: `Remove ${ch.username}`, callback_data: `remove_channel_${ch.username}` }
                        ])
                    }
                });
                return userPreviousMessages[userId] = message7.message_id;
               
             default : 
             if (data.startsWith('remove_channel_')) {
                // Handle the removal of a channel
                const username =  (data.split('_')[2]);
               
                await Channel.findOneAndDelete({ username });
                const channels1 = await Channel.find()
                const channelList1 = channels1.map((ch, index) => `${index + 1}. ${ch.username}`).join('\n');
                const message7 = await bot.sendMessage(userId, `❌ Select the channel to remove:\n${channelList1}`, {
                    reply_markup: {
                        inline_keyboard: channels1.map((ch, index) => [
                            { text: `Remove ${ch.username}`, callback_data: `remove_channel_${ch.username}` }
                        ])
                    }
                });
                userPreviousMessages[userId] = message7.message_id;
                return await bot.answerCallbackQuery(callbackQuery.id, { text: `✅ Channel removed successfully.` });
            } 
        }


        if (callbackQuery.data === 'withdrawal') {
          if (!config.toggle_withdrawals_on && !admins.includes(userId)) {
            const message = await bot.sendPhoto(userId, 'https://ibb.co.com/j5sb32d' , { caption : '🚧 Withdrawals are currently in maintenance mode. Please try again later. 🛠️'  , reply_markup  : {
            inline_keyboard :  [[ { text: '↩️ Back', callback_data: 'menu' }]]
            } });
            return userPreviousMessages[userId] = message.message_id;
          }

          const canWithdraw = await canWithdrawToday(userId);

          if (!canWithdraw && !admins.includes(userId)) {
              const message =  await bot.sendPhoto(userId, 'https://ibb.co.com/tQTXzcd', { caption: 'You can only withdraw once per day. ⏰', reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'menu' }]] } });
              return userPreviousMessages[userId] = message.message_id;
          }

          return await handleWithdrawal(msg, userId);
        }




        const amountMatch = data.match(/^withdraw_(\d+(\.\d{1,2})?)$/);

        if (!amountMatch) {
            await bot.answerCallbackQuery(callbackQuery.id, { text: `❌ Invalid withdrawal option.` });
            return await handleWithdrawal(msg , userId)
        }

        const selectedAmount = parseFloat(amountMatch[1]);
        const userReferral = await User.findOne({ userId });

        if (!userReferral) {
            await bot.answerCallbackQuery(callbackQuery.id, { text: `❌ User data not found.` });
            return ;
        }

        if (selectedAmount > userReferral.bonus) {
            await bot.answerCallbackQuery(callbackQuery.id, { text: `❌ You do not have enough bonus to withdraw ${selectedAmount} USDT.`  });
            await handleWithdrawal(msg , userId)
            return;
        }

        await bot.sendChatAction(userId, 'upload_photo');
        const initialPhoto = 'https://ibb.co/Ksj6JtC';
       const message_id =  await bot.sendPhoto(userId, initialPhoto, {
            caption: `Your withdrawal of ${selectedAmount} USDT has been processed!`, reply_markup: {
                inline_keyboard: [

                    [
                        { text: '↩️ Back', callback_data: 'menu'  }
                    ]
                ]
            }
        });
        const public_id = await bot.sendMessage(  '@RR0000110',  `⏳ <b>Withdrawal Sent Pending</b>\n\n<b>Amount:</b> ${selectedAmount} $USDT \n<b>Wallet:</b> ${userReferral.userId} @XROCKET\n<b>User:</b> @${callbackQuery.message?.chat.username || callbackQuery.message?.chat.first_name || ' '}  \n\nB🤖T- @RR0024_bot`,
            { parse_mode: 'HTML' }
        );
        await bot.answerCallbackQuery(callbackQuery.id, { text: `⏳ Withdrawal of ${selectedAmount} USDT Pending!` });
        await WithdrawalHistory.create({ userId , amount: selectedAmount , proposerId:  message_id.message_id , public_id: public_id.message_id  , username : callbackQuery.message?.chat.username || callbackQuery.message?.chat.first_name || null });
        userReferral.bonus -= selectedAmount;
        await userReferral.save();

    } catch (error) {

    }
});




bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (userPreviousMessages[chatId]) {
        try {
            await bot.deleteMessage(chatId, userPreviousMessages[chatId].toString() as any);
        } catch (error) {

        }
    }


    // Check if the message is from the admin and is a reply to the payment key request
    if (admins.includes(chatId) && adminStates[chatId] === 'awaiting_payment_key') {
        if (text) {
            // Process and save the new payment key
            adminStates[chatId] = ''; // Clear the state

            const config = await getConfig();

            config.paymentKey = text;
            await config.save()

            const message = await bot.sendMessage(chatId, `✅ Payment key has been updated to: ${text}`);
            return userPreviousMessages[chatId] = message.message_id;
        } else {
            const message = await bot.sendMessage(chatId, '❌ Invalid input. Please provide a valid payment key.');
            return userPreviousMessages[chatId] = message.message_id;
        }
    }
    if (admins.includes(chatId) && adminStates[chatId] === 'awaiting_add_channel') {
        if (text) {
            // Process and save the new payment key
            const [username, url] = text.split(',').map(item => item.trim());
            if (username && url) {
                // Process and save the new channel
                adminStates[chatId] = ''; // Clear the state
                const channelList = await Channel.findOne({ username, url })

                if (channelList) {
                    channelList.username = username;
                    channelList.url = url;
                    const message =  await bot.sendMessage(chatId, `✅ Channel added: \nUsername: ${username}\nURL: ${url}`);
                    return userPreviousMessages[chatId] = message.message_id;
                }

                await Channel.create({ url, username });
                const message =  await bot.sendMessage(chatId, `✅ Channel added: \nUsername: ${username}\nURL: ${url}`);
                return userPreviousMessages[chatId] = message.message_id;
            } else {
                const message = await bot.sendMessage(chatId, '❌ Invalid input. Please provide in the format: `username, url`.');
                return userPreviousMessages[chatId] = message.message_id;
            }
        } else {
            const message = await bot.sendMessage(chatId, '❌ Invalid input. Please provide in the format: `username, url`.');
            return userPreviousMessages[chatId] = message.message_id;
        }
    }
    if (admins.includes(chatId) && adminStates[chatId] === 'awaiting_add_refund') {
        if (text) {
            // Process and save the new payment key
            adminStates[chatId] = ''; // Clear the state
            const [userId, amount, symbol] = text.split(',').map(item => item.trim());
            if (userId && amount && symbol) {
                await refundUser(userId, parseInt(amount));
                const message = await bot.sendMessage(chatId, `🔄 Refund successful! An amount of ${amount} ${symbol} has been added to the user's account.`);
                return userPreviousMessages[chatId] = message.message_id;
            }
        } else {
            const message = await bot.sendMessage(chatId, '❌ Invalid input. Please provide in the format: `userid, amount , symbol (e.g., USD)`.');
            return userPreviousMessages[chatId] = message.message_id;
        }
    }

});



const getChannelManagementKeyboard = async (): Promise<InlineKeyboardMarkup> => {
    const config = await getConfig();
    return {
        inline_keyboard: [
            [{ text: '🔗 Add Channel', callback_data: 'add_channel' }, { text: '❌ Remove Channel', callback_data: 'remove_channel' }],
            [{ text: '📜 List Channels', callback_data: 'list_channels' }, { text: config.toggle_bot_off ? '✅ Turn On Bot' : '🚫 Turn Off Bot', callback_data: 'toggle_bot_off' }],
            [{ text: config.toggle_withdrawals_on ? '✅ Turn On Withdrawals' : '🚫 Turn Off Withdrawals', callback_data: 'toggle_withdrawals_on' } , { text: '💸 Change Referral Bonuses', callback_data: 'change_referral_bonuses' } ],
          
            [{ text: '🔑 Add Payment Key', callback_data: 'add_payment_key' }, { text: '🔄 Refund', callback_data: 'refund' } , { text: '↩️ Back', callback_data: 'menu' } ]
        ]
    };
};






setInterval( async () => {
    
    try {
        const userReferral = await WithdrawalHistory.findOne({  status: 'pending' });
       
        const config =  await getConfig();

        if (!config.toggle_withdrawals_on ) {
            return
        }
         
        if (userReferral) {
             
            const { response } = await API_CALL({
                baseURL: 'https://pay.ton-rocket.com/app/transfer',
                method: 'POST',
                body: {
                    "tgUserId": userReferral.userId,
                    "currency": "USDT",
                    "amount": userReferral.amount,
                    "transferId": userReferral.userId.toString() + Math.random().toString(36).substring(2, 10), // generates a random alphanumeric string
                    "description": `🤎🎣 Withdrawal Sent Successfully ${userReferral.userId}`
                },
                headers: { 'Rocket-Pay-Key': config.paymentKey } // Rocket-Pay-Key
            });
            const content = `✅ <b>Withdrawal Sent Successfully</b>\n\n<b>Amount:</b> ${userReferral.amount} $USDT \n<b>WALLET:</b> ${userReferral.userId}\n\nB🤖T- @RR0024_bot`;
            const finalPhoto = 'https://ibb.co/wYBSgQb';
    
           
    
            if (response?.success) {
    
                await bot.editMessageMedia(
                    {
                        type: 'photo',
                        media: finalPhoto,
                        caption: content,
                        parse_mode: 'HTML',
                    },
                    {
                        chat_id: userReferral.userId,
                        message_id: userReferral.proposerId as any,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✅ Payment Channel', url: `https://t.me/RR0000110/${userReferral.public_id}` },
                                { text: '↩️ Back', callback_data: 'menu' }],
                            ],
                        },
                    }
                );

                const text = `⏳ <b>Withdrawal Sent Pending</b>\n\n<b>Amount:</b> ${userReferral.amount } $USDT \n<b>Wallet:</b> ${userReferral.userId} @XROCKET\n<b>User:</b> @${ userReferral.username }  \n\nB🤖T- @RR0024_bot`
               
                await bot.editMessageText(content , { parse_mode : 'HTML' , chat_id :  '@RR0000110'  , message_id : userReferral.public_id as any })
               
                userReferral.status = 'success';
                await userReferral.save()
                return;
            }
    
          
            if (!response?.success) {
                userReferral.status = 'fail';
                await userReferral.save()
                await User.findOneAndUpdate({ userId: userReferral.userId }, { $inc: { bonus: userReferral.amount } });
                await bot.editMessageMedia({ type: 'photo', media: 'https://ibb.co/jG9KM1G', caption: `❌ Found Transfer Error Try 1 min Leter`, parse_mode: 'HTML', },
                    {
                        chat_id: userReferral.userId,
                        message_id: userReferral.proposerId as any,
    
                        reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'menu' }]] }
                    }
                );
            }
    
            if (!response?.errors) return;
           
    
    
        }
    
    } catch (error) {
  
    }
}, 2000 * 20);




console.log('Bot is running...');

app.listen(4000, () => {
    console.log(`Server running on port ${PORT}`);
});   