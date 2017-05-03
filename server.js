'use strict';

const express = require('express');
const Slapp = require('slapp');
const ConvoStore = require('slapp-convo-beepboop');
const Context = require('slapp-context-beepboop');
const slack = require('slack');
const firebase = require('firebase');

process.env.firebase = {
  apiKey: process.env.FIREBASE_GGM_API_KEY,
  projectId: process.env.FIREBASE_GGM_PROJECT_ID,
  storageBucket: process.env.FIREBASE_GGM_STORAGE_BUCKET
};

// initialize firebase
const firebaseConfig = {
  apiKey: process.env.FIREBASE_GGM_API_KEY,
  authDomain: `${process.env.FIREBASE_GGM_PROJECT_ID}.firebaseapp.com`,
  databaseURL: `https://${process.env.FIREBASE_GGM_DB_URL}.firebaseio.com`,
  storageBucket: `${process.env.FIREBASE_GGM_STORAGE_BUCKET}.appspot.com`
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// use `PORT` env let on Beep Boop - default to 3000 locally
let port = process.env.PORT || 6000;

let slapp = Slapp({
  // Beep Boop sets the SLACK_VERIFY_TOKEN env var
  verify_token: process.env.SLACK_VERIFY_TOKEN,
  convo_store: ConvoStore(),
  context: Context()
});

let HELP_TEXT = `
I will respond to the following messages:
\`help\` - to see this message.
\`hi\` - to demonstrate a conversation that tracks state.
\`thanks\` - to demonstrate a simple response.
\`<type-any-other-text>\` - to demonstrate a random emoticon response, some of the time :wink:.
\`attachment\` - to see a Slack attachment message.
`;

let event_count = 0;

const getRandomEmoji = msg => {
  const appToken = msg.meta.app_token;

  return new Promise((resolve, reject) => {
    const payload = {
      token: appToken
    };
    slack.emoji.list(payload, (err, data) => {
      const emoji = data['emoji'];
      const items = Object.keys(emoji);
      const item = items[Math.floor(Math.random() * items.length)];
      resolve([item, emoji[item]]);
    });
  });
};

const createEncounterMessage = (text, msg) => {
  getRandomEmoji(msg).then(val => {
    const emojiName = val[0];
    const emojiImage = val[1];
    const slackMoji = `:${emojiName}:`;

    msg.say({
      channel: process.env.ENCOUNTER_CHANNEL_NAME || 'meme-hunting',
      text: text,
      attachments: [
        {
          text: `A wild ${slackMoji} has appeared!`,
          fallback: val,
          callback_id: 'encounter_callback',
          actions: [
            {
              name: 'answer',
              text: 'Catch',
              type: 'button',
              value: `caught|${slackMoji}`
            },
            {
              name: 'answer',
              text: 'Run',
              type: 'button',
              value: `ran from|${slackMoji}`
            }
          ]
        }
      ]
    });
  });
};

const addEmojiToUser = (ref, emoji) => {
  ref.transaction(user => {
    if (user) {
      if (user.memeventory && user.memeventory[emoji]) {
        user.memeventory[emoji]++;
      } else {
        user.memeventory[emoji] = 1;
      }
    } else {
      user = {
        memeventory: {}
      };
      user.memeventory[emoji] = 1;
    }
    return user;
  });
};

const createEncounterCallback = () => {
  slapp.action('encounter_callback', 'answer', (msg, value) => {
    const parsedValue = value.split('|');
    const command = parsedValue[0];
    const emoji = parsedValue[1];
    if (command === 'caught') {
      addEmojiToUser(db.ref(`users/${msg.body.user.id}`), emoji);
    }
    msg.respond(
      msg.body.response_url,
      `Congrats, ${msg.body.user.name}! You ${command} the wild ${emoji}!`
    );
  });
};

// this will need prefixing so that each encounter has its own callback
// will help to prevent sonnie pls
createEncounterCallback();

const incrementEventCount = msg => {
  event_count++;
  // do logic for encounter here
  if (event_count % 5 === 0) {
    event_count = 0;
    getRandomEmoji(msg);
    createEncounterMessage('ENCOUNTER', msg);
  }
};
//*********************************************
// Setup different handlers for messages
//*********************************************

// response to the user typing "help"
slapp.message('help', ['mention', 'direct_message'], msg => {
  msg.say(HELP_TEXT);
  incrementEventCount(msg);
});

slapp.message('event_count', ['direct_message'], msg => {
  msg.say(`${event_count}`);
  incrementEventCount(msg);
});

slapp.message('memeventory', ['mention', 'direct_message'], msg => {
  console.log(msg.body.event);
  db
    .ref(`users/${msg.body.event.user}/memeventory`)
    .once('value')
    .then(snapshot => {
      const memeventory = snapshot.val();
      console.log(memeventory);
      const memeventoryHeader = Object.keys(memeventory)
        .map(key => {
          return `${key}`;
        })
        .join(' ');
      msg.say(memeventoryHeader);
      const formattedMemes = Object.keys(memeventory)
        .map(key => {
          const emojiCount = memeventory[key];
          return `  ${emojiCount}  `;
        })
        .join('');
      const memeventoryBody = `\`${formattedMemes}\``;
      msg.say(memeventoryBody);
    });
});

// increment the message count
slapp.message('.*', msg => {
  incrementEventCount(msg);
});

// attach Slapp to express server
let server = slapp.attachToExpress(express());

// start http server
server.listen(port, err => {
  if (err) {
    return console.error(err);
  }

  console.log(`Listening on port ${port}`);
});
