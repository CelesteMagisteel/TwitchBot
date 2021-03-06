const tmi = require('tmi.js');
const discord = require("discord.js")
const fs = require('fs');
const cron = require('node-cron')
const path = require('path');
global.appRoot = path.resolve(__dirname);

if (!fs.existsSync('quotes.json')) {
    fs.writeFileSync('quotes.json', "{\"quotes\":[]}");
}

const config = require('./config.json')
const modules = require('./modules.json')

let announcementIndex = 0;
let discordClient = new discord.Client();

const opts = {
    identity: {
        username: config.client,
        password: config.token
    },
    channels: [config.channel]
};
const twitchClient = new tmi.client(opts);

const commands = {};
for (let x in modules) {
    const commandFiles = fs.readdirSync('./commands/' + x).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(`./commands/` + x + `/${file}`);
        commands[command.name] = command;
        let alias;
        for (alias in command.aliases) { commands[command.aliases[alias]] = command; }

    }
}

const responseFiles = fs.readdirSync('./responses').filter(file => file.endsWith('.js'));
const responses = {}
for (const file of responseFiles) {
    const response = require(`./responses/${file}`);
    for (const trigger of response.triggers) { responses[trigger] = response; }
    //responses.sort(function (a, b) { if (a.priority < b.priority) { return 1; } else if (a.priority === b.priority) { return 0;} else { return -1; }});
}

let discordChannel;

twitchClient.on('message', function (channel, sender, message, self) {
    if (self) { return; } // Ignore messages from the bot

    if (discordChannel != null) discordChannel.send("**" + sender['display-name'] + ":** " + message);

    const args = message.slice(config.prefix.length).split(/ +/);
    const commandName = args.shift().toLowerCase();

    let responded = false;
    for (let response in responses) {
        if (message.includes(response) && !responded) {
            if (Math.random() <= responses[response].chance / 100) {
                responses[response].twitchExecute(twitchClient, channel, sender, message); responded = true;
            }
        }
    }

    if (!message.startsWith(config.prefix)) return;

    const command = commands[commandName];

    if (command == null) return;
    if (command.args && !args.length) return twitchClient.say(channel, `, You didn't provide any arguments`);

    try {
        command.twitchExecute(twitchClient, channel, sender, message, args);
    } catch (error) {
        console.error(error);
        twitchClient.say(channel, 'There was an error trying to execute that command!');
    }
});

discordClient.on('message', message => {
    if (message.author.bot) return;

    const args = message.content.slice(config.prefix.length).split(/ +/);
    const commandName = args.shift().toLowerCase();

    let responded = false;
    for (let response in responses) {
        let regex = new RegExp(response, "gi");
        if (regex.test(message.content) && !responded) {
            if (Math.random() <= response.chance / 100) {
                responses[response].discordExecute(message); responded = true;
            }
        }
    }


    if (!message.content.startsWith(config.prefix)) return;

    const command = commands[commandName];

    if (command == null) return;
    if (command.args && !args.length) return message.reply("No arguments were provided");

    try {
        command.discordExecute(message, args);
    } catch (error) {
        console.error(error);
        message.reply("An error occurred during execution");
    }
});

twitchClient.on('connected', function (addr, port) {
    console.log(`* Connected to ${addr}:${port}`);
    // Used increments for nicer timings, rather than just every 5 minutes from starting
    let interval;
    if (config["announce-interval"] < 1) { interval = 1; }
    else if (config["announce-interval"] > 60) { interval = 60; }
    else { interval = Math.round(config["announce-interval"]); }
    let cronSchedule = "";
    for (let i = 0; i < 60; i = i + interval) {
        if (i === 0) {
            cronSchedule += i;
        } else {
            cronSchedule += ("," + i);
        }
        //console.log(cronSchedule);
    }
    cronSchedule += " * * * *";
    //console.log(cronSchedule);
    if (config.announcements.length > 0) {
        cron.schedule(cronSchedule, () => {
            twitchClient.say(config.channel, config.announcements[announcementIndex]);
            announcementIndex++;
            if (announcementIndex >= config.announcements.length) announcementIndex = 0;
        });
    }
});

discordClient.on('ready', () => {
    console.log(`Logged in as ${discordClient.user.tag} at ${new Date()}!`);
    discordChannel = discordClient.channels.cache.get(config["discord-log-channel"]);
});

twitchClient.connect();
discordClient.login(config["discord-token"])
