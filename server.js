'use strict';

const express = require('express');
const Slapp = require('slapp');
const ConvoStore = require('slapp-convo-beepboop');
const Context = require('slapp-context-beepboop');
const slack = require('slack');

// use `PORT` env var on Beep Boop - default to 3000 locally
var port = process.env.PORT || 6000;

var slapp = Slapp({
  // Beep Boop sets the SLACK_VERIFY_TOKEN env var
  verify_token: process.env.SLACK_VERIFY_TOKEN,
  convo_store: ConvoStore(),
  context: Context()
});

var HELP_TEXT = `
I will respond to the following messages:
\`help\` - to see this message.
\`hi\` - to demonstrate a conversation that tracks state.
\`thanks\` - to demonstrate a simple response.
\`<type-any-other-text>\` - to demonstrate a random emoticon response, some of the time :wink:.
\`attachment\` - to see a Slack attachment message.
`;

var event_count = 0;

const getRandomEmoji = (msg) => {
    const appToken = msg.meta.app_token;

    return new Promise((resolve, reject) => {
        const payload = {
            token: appToken
        };
        slack.emoji.list(payload, (err, data) => {
            const emoji = data['emoji'];
            const items = Object.keys(emoji);
            const item = items[Math.floor(Math.random()*items.length)];
            resolve([item, emoji[item]]);
        });
    })
};

const createEncounterMessage = (text, msg) => {
    getRandomEmoji(msg).then((val) => {
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
                        { name: 'answer', text: 'Catch', type: 'button', value: `caught|${slackMoji}` },
                        { name: 'answer', text: 'Run', type: 'button', value: `ran from|${slackMoji}` }
                    ]
                }
            ]
        });
    });
}

const createEncounterCallback = () => {
    slapp.action('encounter_callback', 'answer', (msg, value) => {
        const parsedValue = value.split('|');
        const command = parsedValue[0];
        const emoji = parsedValue[1];
        msg.respond(
            msg.body.response_url,
            `Congrats, ${msg.body.user.name}! You ${command} the wild ${emoji}!`
        );
    });
}

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

// demonstrate returning an attachment...
slapp.message('attachment', ['mention', 'direct_message'], msg => {
  msg.say({
    text: 'Check out this amazing attachment! :confetti_ball: ',
    attachments: [
      {
        text: 'Slapp is a robust open source library that sits on top of the Slack APIs',
        title: 'Slapp Library - Open Source',
        image_url: 'https://storage.googleapis.com/beepboophq/_assets/bot-1.22f6fb.png',
        title_link: 'https://beepboophq.com/',
        color: '#7CD197'
      }
    ]
  });
  incrementEventCount(msg);
});

// increment the message count
slapp.message('.*', msg => {
  incrementEventCount(msg);
});

// attach Slapp to express server
var server = slapp.attachToExpress(express());

// start http server
server.listen(port, err => {
  if (err) {
    return console.error(err);
  }

  console.log(`Listening on port ${port}`);
});
