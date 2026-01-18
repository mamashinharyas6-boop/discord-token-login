delete window.$;
let wpRequire = webpackChunkdiscord_app.push([[Symbol()], {}, r => r]);
webpackChunkdiscord_app.pop();

let ApplicationStreamingStore = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.getStreamerActiveStreamMetadata).exports.Z;
let RunningGameStore = Object.values(wpRequire.c).find(x => x?.exports?.ZP?.getRunningGames).exports.ZP;
let QuestsStore = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.getQuest).exports.Z;
let ChannelStore = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.getAllThreadsForParent).exports.Z;
let GuildChannelStore = Object.values(wpRequire.c).find(x => x?.exports?.ZP?.getSFWDefaultChannel).exports.ZP;
let FluxDispatcher = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.flushWaitQueue).exports.Z;
let api = Object.values(wpRequire.c).find(x => x?.exports?.tn?.get).exports.tn;

// HARyas version - randomized timing, realistic paths, VC detection
const supportedTasks = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY", "WATCH_VIDEO_ON_MOBILE"];
const realisticPaths = [
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\",
    "C:\\Program Files\\Epic Games\\",
    "C:\\Users\\{user}\\AppData\\Local\\",
    "C:\\Program Files\\",
    "D:\\Games\\"
];

let quests = [...QuestsStore.quests.values()].filter(x => 
    x.userStatus?.enrolledAt && 
    !x.userStatus?.completedAt && 
    new Date(x.config.expiresAt).getTime() > Date.now() && 
    supportedTasks.find(y => Object.keys((x.config.taskConfig ?? x.config.taskConfigV2).tasks).includes(y))
);

let isApp = typeof DiscordNative !== "undefined";
let isInVC = () => ChannelStore.getVoiceStatesForChannel?.(ChannelStore.getChannelId())?.length > 1;

if(quests.length === 0) {
    console.log("No active quests found!");
} else {
    let doJob = async function(attempt = 0) {
        const quest = quests.pop();
        if(!quest) return;

        const applicationId = quest.config.application.id;
        const applicationName = quest.config.application.name;
        const questName = quest.config.messages.questName;
        const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
        const taskName = supportedTasks.find(x => taskConfig.tasks[x] != null);
        const secondsNeeded = taskConfig.tasks[taskName].target;
        let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;

        // HARyas: Dynamic randomization
        const randDelay = (min, max) => Math.random() * (max - min) + min;
        const getRandomPath = () => realisticPaths[Math.floor(Math.random() * realisticPaths.length)]
            .replace("{user}", "User");

        console.log(`[HARyas] Starting ${questName} (${taskName}): ${secondsDone}/${secondsNeeded}s`);

        if(taskName === "WATCH_VIDEO" || taskName === "WATCH_VIDEO_ON_MOBILE") {
            const speeds = [1.2, 1.5, 2.0]; // HARyas: Realistic speeds only
            const speed = speeds[Math.floor(Math.random() * speeds.length)];
            const interval = randDelay(1.8, 3.2); // HARyas: Human-like intervals
            
            const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();
            let fn = async () => {
                while(secondsDone < secondsNeeded) {
                    const maxAllowed = Math.floor((Date.now() - enrolledAt)/1000) + 5;
                    const timestamp = Math.min(secondsNeeded, secondsDone + speed + Math.random() * 0.5);
                    
                    if(timestamp <= maxAllowed) {
                        try {
                            const res = await api.post({
                                url: `/quests/${quest.id}/video-progress`, 
                                body: {timestamp: timestamp}
                            });
                            secondsDone = timestamp;
                            console.log(`[HARyas] Video: ${Math.floor(secondsDone)}/${secondsNeeded}s`);
                        } catch(e) {
                            console.log("[HARyas] API error, retrying...");
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    }
                    
                    if(secondsDone >= secondsNeeded) break;
                    await new Promise(resolve => setTimeout(resolve, interval * 1000));
                }
            };
            fn().then(() => {
                console.log(`[HARyas] ✅ ${questName} completed`);
                setTimeout(() => doJob(), randDelay(2, 5) * 1000);
            });

        } else if(taskName === "PLAY_ON_DESKTOP") {
            if(!isApp) {
                console.log("[HARyas] Desktop app required for game quests");
                return doJob();
            }

            api.get({url: `/applications/public?application_ids=${applicationId}`}).then(async res => {
                const appData = res.body[0];
                const exeName = appData.executables.find(x => x.os === "win32")?.name?.replace(">","") || `${appData.name}.exe`;
                const pid = Math.floor(Math.random() * 65535) + 1000;
                const fakePath = `${getRandomPath()}${appData.name.replace(/[^a-zA-Z0-9]/g,'')}\\${exeName}`;
                
                const fakeGame = {
                    cmdLine: fakePath,
                    exeName,
                    exePath: fakePath.toLowerCase(),
                    hidden: Math.random() > 0.7,
                    isLauncher: false,
                    id: applicationId,
                    name: appData.name,
                    pid,
                    pidPath: [pid],
                    processName: appData.name,
                    start: Date.now() - randDelay(300, 3600) * 1000 // HARyas: Realistic start time
                };

                // HARyas: Gradual store override
                const realGames = RunningGameStore.getRunningGames();
                RunningGameStore.getRunningGames = () => [...realGames, fakeGame];
                FluxDispatcher.dispatch({
                    type: "RUNNING_GAMES_CHANGE", 
                    removed: [], 
                    added: [fakeGame], 
                    games: [...realGames, fakeGame]
                });

                let heartbeatInterval = setInterval(async () => {
                    if(secondsDone >= secondsNeeded) {
                        clearInterval(heartbeatInterval);
                        cleanup();
                        return;
                    }
                }, 30000);

                let fn = data => {
                    secondsDone = quest.config.configVersion === 1 ? 
                        data.userStatus.streamProgressSeconds : 
                        Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value);
                    
                    console.log(`[HARyas] Game: ${Math.floor(secondsDone)}/${secondsNeeded}s`);
                };

                FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);

                const cleanup = () => {
                    RunningGameStore.getRunningGames = () => realGames;
                    FluxDispatcher.dispatch({
                        type: "RUNNING_GAMES_CHANGE", 
                        removed: [fakeGame], 
                        added: [], 
                        games: realGames
                    });
                    FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
                };

                setTimeout(() => {
                    cleanup();
                    console.log(`[HARyas] ✅ ${questName} completed`);
                    setTimeout(() => doJob(), randDelay(3, 8) * 1000);
                }, (secondsNeeded - secondsDone + randDelay(30, 120)) * 1000);
            });

        } else if(taskName === "STREAM_ON_DESKTOP") {
            if(!isApp || !isInVC()) {
                console.log("[HARyas] Need desktop app + VC with 1+ person for stream quests");
                return doJob();
            }

            const pid = Math.floor(Math.random() * 65535) + 1000;
            const realFunc = ApplicationStreamingStore.getStreamerActiveStreamMetadata;
            ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({
                id: applicationId,
                pid,
                sourceName: "Desktop Capture"
            });

            let fn = data => {
                secondsDone = quest.config.configVersion === 1 ? 
                    data.userStatus.streamProgressSeconds : 
                    Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value);
                console.log(`[HARyas] Stream: ${Math.floor(secondsDone)}/${secondsNeeded}s`);
            };

            FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);

            setTimeout(() => {
                ApplicationStreamingStore.getStreamerActiveStreamMetadata = realFunc;
                FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
                console.log(`[HARyas] ✅ ${questName} completed`);
                setTimeout(() => doJob(), randDelay(2, 6) * 1000);
            }, (secondsNeeded - secondsDone + randDelay(60, 180)) * 1000);

        } else if(taskName === "PLAY_ACTIVITY") {
            const channelId = ChannelStore.getSortedPrivateChannels()[0]?.id ?? 
                Object.values(GuildChannelStore.getAllGuilds())
                    .flatMap(g => g?.VOCAL || [])
                    .find(c => c)?.channel.id;

            if(!channelId) {
                console.log("[HARyas] No suitable channel found");
                return doJob();
            }

            const streamKey = `call:${channelId}:1`;
            let progress = secondsDone;

            const heartbeat = async () => {
                try {
                    const res = await api.post({
                        url: `/quests/${quest.id}/heartbeat`, 
                        body: {stream_key: streamKey, terminal: false}
                    });
                    progress = res.body.progress.PLAY_ACTIVITY.value;
                    console.log(`[HARyas] Activity: ${Math.floor(progress)}/${secondsNeeded}s`);
                    
                    if(progress >= secondsNeeded) {
                        await api.post({
                            url: `/quests/${quest.id}/heartbeat`, 
                            body: {stream_key: streamKey, terminal: true}
                        });
                        console.log(`[HARyas] ✅ ${questName} completed`);
                        setTimeout(() => doJob(), randDelay(1, 4) * 1000);
                        return;
                    }
                } catch(e) {
                    console.log("[HARyas] Heartbeat failed, retrying...");
                }
                
                setTimeout(heartbeat, randDelay(18, 25) * 1000); // HARyas: Realistic heartbeat timing
            };

            heartbeat();
        }
    };
    
    doJob();
}
