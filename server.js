'use strict';

const express = require('express');
const Slapp = require('slapp');
const ConvoStore = require('slapp-convo-beepboop');
const Context = require('slapp-context-beepboop');
const slack = require('slack');
const firebase = require('firebase');

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
let events_needed = 5;

// from http://stackoverflow.com/a/34890276
const groupBy = (xs, key) => {
  return xs.reduce(function(rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
};

const getAllEmoji = msg => {
  const appToken = msg.meta.app_token || msg.resource.app_token;

  return new Promise((resolve, reject) => {
    const payload = {
      token: appToken
    };
    slack.emoji.list(payload, (err, data) => {
      const emoji = data['emoji'];
      resolve(emoji);
    });
  });
};

const getRandomEmoji = msg => {
  return getAllEmoji(msg).then(emoji => {
    const emojiNames = Object.keys(emoji);
    let emojiItem = emojiNames[Math.floor(Math.random() * emojiNames.length)];
    return {
      name: emojiItem,
      image: emoji[emojiItem]
    };
  });
};

const createEncounterMessage = (text, msg) => {
  getRandomEmoji(msg).then(val => {
    const emojiName = val.name;
    const emojiImage = val.image;
    const slackMoji = `:${emojiName}:`;

    msg.say({
      channel: process.env.ENCOUNTER_CHANNEL_NAME || 'meme-hunting',
      text: text,
      attachments: [
        {
          title: `A wild ${slackMoji} has appeared!~`,
          image_url: emojiImage
        },
        {
          title: 'MAKE A CHOICE!',
          fallback: 'MAKE A CHOICE!',
          callback_id: 'encounter_callback',
          actions: [
            {
              name: 'answer',
              text: 'Ball',
              type: 'button',
              value: `caught|${slackMoji}|${emojiImage}`
            },
            {
              name: 'answer',
              text: 'Bait',
              type: 'button',
              value: `bait|${slackMoji}|${emojiImage}`
            },
            {
              name: 'answer',
              text: 'Run',
              type: 'button',
              value: `ran from|${slackMoji}|${emojiImage}`
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

let encounterCallbackTimeout = null;

const createEncounterCallback = () => {
  slapp.action('encounter_callback', 'answer', (msg, value) => {
    const parsedValue = value.split('|');
    const command = parsedValue[0];
    const emoji = parsedValue[1];
    const emojiImage = parsedValue[2];
    if (command === 'caught') {
      addEmojiToUser(db.ref(`users/${msg.body.user.id}`), emoji);
    }
    if (!encounterCallbackTimeout) {
      encounterCallbackTimeout = setTimeout(() => {
        encounterCallbackTimeout = null;
        msg.respond(msg.body.response_url, {
          title: 'Encounter ended!',
          attachments: [
            {
              title: `A wild ${emoji} has left the scene!~`,
              image_url: emojiImage
            },
            {
              title: 'Results',
              text: 'Some shit happened'
            }
          ]
        });
      }, 5000);
    }
  });
};

// this will need prefixing so that each encounter has its own callback
// will help to prevent sonnie pls
createEncounterCallback();

const incrementEventCount = msg => {
  event_count++;
  // do logic for encounter here
  if (event_count % events_needed === 0) {
      event_count = 0;
      events_needed = Math.floor(Math.random() * 20);
    createEncounterMessage('ENCOUNTER', msg);
  }
};
//*********************************************
// Setup different handlers for messages
//*********************************************

slapp.command('/big', '\:(.*)\:', (msg, text, emojiName) => {
  // text == :emojiName:
  getAllEmoji(msg).then(emoji => {
    const userEmoji = emoji[emojiName];
    msg.say({
      token: msg.meta.app_token,
      text: `*${msg.body.user_name}*`,
      attachments: [
        {
          title: '',
          color: '#420',
          image_url: userEmoji
        }
      ]
    });
  });
});

// response to the user typing "help"
slapp.message('help', ['mention', 'direct_message'], msg => {
  msg.say(HELP_TEXT);
  incrementEventCount(msg);
});

slapp.message('event_count', ['direct_message'], msg => {
  msg.say(`${event_count}`);
  incrementEventCount(msg);
});

const doMemeventory = msg => {
  db
    .ref(`users/${msg.body.event.user}/memeventory`)
    .once('value')
    .then(snapshot => {
      const allEmoji = snapshot.val();
      const messageFields = Object.keys(allEmoji).map(emoji => {
        return {
          title: emoji,
          value: allEmoji[emoji]
        };
      });
      const groupedFields = groupBy(messageFields, 'value');
      const almostThere = Object.keys(groupedFields).map(count => {
        const emojiNames = groupedFields[count]
          .map(item => item.title)
          .join(' ');
        return {
          title: count,
          value: emojiNames
        };
      });
      msg.say({
        text: '',
        attachments: [
          {
            title: `<@${msg.body.event.user}>'s Memeventory`,
            text: 'Some user stats',
            fields: almostThere
          }
        ]
      });
    });
};

slapp.message('mvty', ['mention', 'direct_message'], msg => {
  doMemeventory(msg);
});

slapp.message('memeventory', ['mention', 'direct_message'], msg => {
  doMemeventory(msg);
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
