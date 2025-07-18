
const axios = require('axios');
const fs = require('fs');
const express = require('express');
const sharp = require('sharp');
const blockhash = require('blockhash-core');
const app = express();
const port = process.env.PORT || 3000;
const config = require('./config.json');

app.get('/', (req, res) => {
  res.send('✅ LINE OA Monitor with sharp + blockhash-core and multi-account support is Running');
});

app.get('/check', async (req, res) => {
  console.log(`[HTTP] เรียกตรวจสอบจาก /check`);
  await checkAllAccounts();
  res.send('✅ ตรวจสอบแล้ว (ทุกบัญชี)');
});

app.listen(port, () => {
  console.log(`✅ Web server started on port ${port}`);
});

async function getLineBotInfo(channelAccessToken) {
  const res = await axios.get('https://api.line.me/v2/bot/info', {
    headers: {
      Authorization: `Bearer ${channelAccessToken}`
    }
  });
  return {
    displayName: res.data.displayName,
    pictureUrl: res.data.pictureUrl || null
  };
}

async function hashImageFromUrl(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const imgBuffer = Buffer.from(response.data);

    const image = sharp(imgBuffer);
    const { data, info } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });

    const hash = blockhash.bmvbhash(data, info.width, info.height, 16);
    return hash;
  } catch (error) {
    console.error(`❌ Error hashing image from URL: ${url}`, error.message);
    throw error;
  }
}

function hammingDistance(hash1, hash2) {
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance;
}

function saveExpectedPicture(accountName, pictureUrl) {
  const filename = `expectedPicture_${accountName}.json`;
  const data = {
    pictureUrl: pictureUrl,
    savedAt: new Date().toISOString()
  };
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`📸 เซฟรูป expected สำหรับ ${accountName} แล้ว`);
}

async function sendTelegram(botToken, chatId, message) {
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: message
    });
  } catch (err) {
    console.error("❌ Error sending Telegram message:", err.response?.data || err.message);
  }
}

async function checkAllAccounts() {
  for (const account of config.accounts) {
    let changes = [];
    try {
      console.log(`
🔄 ตรวจสอบบัญชี: ${account.name}`);
      const current = await getLineBotInfo(account.channelAccessToken);

      let expectedPictureUrl;
      const expectedFile = `expectedPicture_${account.name}.json`;

      if (fs.existsSync(expectedFile)) {
        const expectedData = JSON.parse(fs.readFileSync(expectedFile));
        expectedPictureUrl = expectedData.pictureUrl;
      } else {
        // Save expected picture automatically
        saveExpectedPicture(account.name, current.pictureUrl);
        expectedPictureUrl = current.pictureUrl;
        changes.push(`📸 เซฟรูป expected อัตโนมัติ`);
      }

      try {
        // Compare pHash
        const expectedHash = await hashImageFromUrl(expectedPictureUrl);
        const currentHash = await hashImageFromUrl(current.pictureUrl);
        const distance = hammingDistance(expectedHash, currentHash);
        const similarity = ((1 - distance / (expectedHash.length * 4)) * 100).toFixed(2);

        if (similarity < 95) {
          changes.push(`❌ รูปเปลี่ยน (ความเหมือน ${similarity}%)`);
        } else {
          changes.push(`✅ รูปเหมือนกัน (ความเหมือน ${similarity}%)`);
        }
      } catch (hashErr) {
        changes.push(`⚠️ ไม่สามารถตรวจสอบรูปได้: ${hashErr.message}`);
      }
    } catch (err) {
      changes.push(`❌ เกิดข้อผิดพลาด: ${err.response?.data || err.message}`);
    } finally {
      if (changes.length === 0) {
        changes.push(`ℹ️ ไม่มีการเปลี่ยนแปลง`);
      }
      const msg = `📢 [${account.name}]
${changes.join('\n')}`;
      await sendTelegram(account.telegramBotToken, account.telegramChatId, msg);
      console.log(`✅ ตรวจสอบแล้ว: ${account.name}`);
    }
  }
}

// 🕒 ตั้งเวลาเช็คอัตโนมัติ (configurable)
const intervalMs = config.checkIntervalMinutes * 60 * 1000;
console.log(`⏱️ ระบบจะตรวจสอบทุก ${config.checkIntervalMinutes} นาที`);
setInterval(() => {
  console.log(`
⏳ เริ่มการตรวจสอบอัตโนมัติ`);
  checkAllAccounts();
}, intervalMs);

// เรียกตรวจสอบทันทีเมื่อเริ่มต้น
checkAllAccounts();
