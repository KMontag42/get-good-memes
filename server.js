'use strict';

const express = require('express');
const Slapp = require('slapp');
const ConvoStore = require('slapp-convo-beepboop');
const Context = require('slapp-context-beepboop');

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

const incrementEventCount = msg => {
    event_count++;
    // do logic for encounter here
    if (event_count % 5 === 0) {
        event_count = 0;
        msg.say({
            channel: process.env.ENCOUNTER_CHANNEL_NAME || 'meme-hunting',
            text: 'ENCOUNTER'
        });
    }
}
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
