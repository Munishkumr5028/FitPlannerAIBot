// bot.js
require("dotenv").config();
require("./db");
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const User = require("./models/User");
const { generateDietPlan } = require("./dietLogic");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const sessions = {}; // in-memory session store
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

function resetSession(chatId) {
  sessions[chatId] = { lastActive: Date.now() };
}

function checkSessionTimeout(chatId) {
  const session = sessions[chatId];
  if (!session) return false;
  return Date.now() - (session.lastActive || 0) > SESSION_TIMEOUT;
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  if (checkSessionTimeout(chatId)) resetSession(chatId);
  else if (!sessions[chatId]) resetSession(chatId);

  sessions[chatId].lastActive = Date.now();

  try {
    const existingUser = await User.findOne({ telegramId: chatId });

    if (existingUser) {
      const plan = {
        bmi: existingUser.bmi,
        calories: existingUser.calories,
        meals: existingUser.meals,
        status: getBmiStatus(existingUser.bmi),
      };
      const mealPlan = plan.meals.join("\n");
      const summary = `
📝 *Your Saved Info:*
\
\
\`\`\`
Name     : ${existingUser.name}
Height   : ${existingUser.height} cm
Weight   : ${existingUser.weight} kg
Age      : ${existingUser.age}
Gender   : ${existingUser.gender}
Diet     : ${existingUser.diet}
Activity : ${existingUser.activity}
Goal     : ${existingUser.goal}
\`\`\`

📊 *BMI:* ${plan.bmi} (${plan.status})
🔥 *Calories Needed:* ${plan.calories} kcal

🍽️ *Your Meal Plan:*
${mealPlan}

💬 Type /reset if you want to create a new plan.
❤️ Thanks for connecting with us. Developed by *Munish Kumar*.`;
      bot.sendMessage(chatId, summary, { parse_mode: "Markdown" });
    } else {
      bot.sendMessage(chatId, "👋 Welcome to FitPlanner Bot!\n🧑‍💼 What’s your name?");
    }
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "⚠️ Sorry, something went wrong. Please try again later.");
  }
});

bot.onText(/\/reset/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await User.deleteOne({ telegramId: chatId });
    resetSession(chatId);
    bot.sendMessage(chatId, "🗑️ Your data has been reset. Let's start over.\nWhat’s your name?");
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "⚠️ Unable to reset your data. Please try again.");
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (text.startsWith("/")) return;
  if (!sessions[chatId] || checkSessionTimeout(chatId)) {
    resetSession(chatId);
  }
  sessions[chatId].lastActive = Date.now();
  const session = sessions[chatId];

  if (!session.name) {
    session.name = text.trim();
    return bot.sendMessage(chatId, "📏 What is your height in cm?");
  }

  if (!session.height) {
    const height = parseInt(text);
    if (isNaN(height))
      return bot.sendMessage(chatId, "❌ Please enter a valid number for height in cm.");
    session.height = height;
    return bot.sendMessage(chatId, "⚖️ What is your weight in kg?");
  }

  if (!session.weight) {
    const weight = parseInt(text);
    if (isNaN(weight))
      return bot.sendMessage(chatId, "❌ Please enter a valid number for weight in kg.");
    session.weight = weight;
    return bot.sendMessage(chatId, "🎂 What is your age?");
  }

  if (!session.age) {
    const age = parseInt(text);
    if (isNaN(age))
      return bot.sendMessage(chatId, "❌ Please enter a valid number for age.");
    session.age = age;
    return bot.sendMessage(chatId, "🚻 What’s your gender?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Male", callback_data: "gender_male" }],
          [{ text: "Female", callback_data: "gender_female" }],
        ],
      },
    });
  }
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const session = sessions[chatId];
  const data = query.data;
  if (!session) return;
  session.lastActive = Date.now();

  if (data.startsWith("gender_")) {
    session.gender = data.split("_")[1];
    return bot.sendMessage(chatId, "🍽️ What’s your diet preference?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Vegetarian", callback_data: "diet_veg" }],
          [{ text: "Non-Vegetarian", callback_data: "diet_nonveg" }],
          [{ text: "Vegan", callback_data: "diet_vegan" }],
        ],
      },
    });
  }

  if (data.startsWith("diet_")) {
    session.diet = data.split("_")[1];
    return bot.sendMessage(chatId, "💪 What’s your activity level?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Sedentary", callback_data: "activity_sedentary" }],
          [{ text: "Light", callback_data: "activity_light" }],
          [{ text: "Moderate", callback_data: "activity_moderate" }],
          [{ text: "Heavy", callback_data: "activity_heavy" }],
        ],
      },
    });
  }

  if (data.startsWith("activity_")) {
    session.activity = data.split("_")[1];
    return bot.sendMessage(chatId, "🎯 What’s your goal?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Lose Weight", callback_data: "goal_lose" }],
          [{ text: "Gain Weight", callback_data: "goal_gain" }],
          [{ text: "Maintain Weight", callback_data: "goal_maintain" }],
        ],
      },
    });
  }

  if (data.startsWith("goal_")) {
    session.goal = data.split("_")[1];
    const plan = generateDietPlan(session);
    const mealPlan = plan.meals.join("\n");

    try {
      await User.findOneAndUpdate(
        { telegramId: chatId },
        {
          telegramId: chatId,
          name: session.name,
          height: session.height,
          weight: session.weight,
          age: session.age,
          gender: session.gender,
          diet: session.diet,
          activity: session.activity,
          goal: session.goal,
          bmi: plan.bmi,
          calories: plan.calories,
          meals: plan.meals,
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error("DB Save error:", err);
      return bot.sendMessage(chatId, "⚠️ Could not save your data. Please try again later.");
    }

    const summary = `
📝 *Your Provided Info:*
\`\`\`
Name     : ${session.name}
Height   : ${session.height} cm
Weight   : ${session.weight} kg
Age      : ${session.age}
Gender   : ${session.gender}
Diet     : ${session.diet}
Activity : ${session.activity}
Goal     : ${session.goal}
\`\`\`

📊 *BMI:* ${plan.bmi} (${getBmiStatus(plan.bmi)})
🔥 *Calories Needed:* ${plan.calories} kcal

🍽️ *Your Meal Plan:*
${mealPlan}

💬 Type /reset if you want to create a new plan.
❤️ Thanks for connecting with us. Developed by *Munish Kumar*.`;

    bot.sendMessage(chatId, summary, { parse_mode: "Markdown" });
    delete sessions[chatId];
  }
});

function getBmiStatus(bmi) {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal weight";
  if (bmi < 30) return "Overweight";
  return "Obesity";
}
