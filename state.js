// state.js — the brain.
//
// All personality is computed here and handed to the renderer as a flat `model`
// of numbers. Inputs arrive via three channels:
//   setTitle(title)        → page/app context (cases 8–29)
//   update(dt, {speed,…})  → cursor motion → movement physics + idle tiers
//   fireEvent / setHeld    → discrete input + system events (cases 38–66)
//
// Behaviour kinds (per spec):
//   PERSISTENT  — held flag / context, lasts while true
//   ONE-SHOT    — fireEvent(), plays once over a fixed duration
//   LOOPING IDLE— context/held + an idle-repeat timer

// ---------------------------------------------------------------------------
// Age arc (cases 2–7): keyed to local wall-clock hour.
// ---------------------------------------------------------------------------
const AGE_STAGES = [
  { from:  6, name: "baby",       restLid: 0.0,  whiteBrows: false, glasses: "none",    cane: false, baby: true,  wrinkles: false, slow: 1,   hunched: false, bags: false },
  { from: 12, name: "adult",      restLid: 0.05, whiteBrows: false, glasses: "reading", cane: false, baby: false, wrinkles: false, slow: 1,   hunched: false, bags: false },
  { from: 18, name: "mature",     restLid: 0.20, whiteBrows: false, glasses: "reading", cane: false, baby: false, wrinkles: true,  slow: 1,   hunched: false, bags: false },
  { from: 22, name: "old",        restLid: 0.42, whiteBrows: true,  glasses: "reading", cane: true,  baby: false, wrinkles: true,  slow: 1.6, hunched: false, bags: false },
  { from: 23, name: "very-tired", restLid: 0.52, whiteBrows: true,  glasses: "reading", cane: true,  baby: false, wrinkles: true,  slow: 2.8, hunched: false, bags: true  },
  { from:  0, name: "grandpa",    restLid: 0.58, whiteBrows: true,  glasses: "reading", cane: true,  baby: false, wrinkles: true,  slow: 4.5, hunched: true,  bags: true  },
];

function stageForHour(hour) {
  if (hour >= 6  && hour < 12) return AGE_STAGES[0]; // baby     06–12
  if (hour >= 12 && hour < 18) return AGE_STAGES[1]; // adult    12–18
  if (hour >= 18 && hour < 22) return AGE_STAGES[2]; // mature   18–22 (wrinkles by 6pm)
  if (hour >= 22 && hour < 23) return AGE_STAGES[3]; // old      22–23 (glasses+cane)
  if (hour === 23)              return AGE_STAGES[4]; // v-tired  23–00 (bags, after 11pm)
  return AGE_STAGES[5];                               // grandpa  00–06 (slow blink, hunch)
}

// ---------------------------------------------------------------------------
// Context keyword map — most-specific first, first match wins. Keywords are
// matched against the lowercased "AppName PageTitle" string from the backend.
// Researched against real window/tab titles for each site & app.
// ---------------------------------------------------------------------------
const CONTEXT_KEYWORDS = [
  // Transactional / high-priority states
  ["success",   ["payment successful","payment success","payment complete","payment received","order confirmed","order placed","order placed successfully","thank you for your order","booking confirmed","ticket booked","purchase complete","your order is confirmed","transaction successful","transaction complete","receipt"]],
  ["checkout",  ["checkout","check out","order summary","place order","review your order","secure checkout","shopping bag","shopping cart","your cart","my cart","view cart","cart (","cart -","payment method","payment details","billing","proceed to pay","proceed to payment","proceed to checkout","proceed to buy","complete purchase","complete your purchase","confirm and pay","confirm & pay","pay now","order total","subtotal","card number","cvv","shipping address","delivery address","buy now",
                 // URL path fragments (the backend now appends the tab URL)
                 "/checkout","/cart","/gp/cart","/placeorder","/order-summary","/payment","/billing","/buy"]],
  // Sensitive
  ["nsfw",      ["onlyfans","pornhub","xvideos","xhamster","redtube","xnxx","youporn","spankbang","brazzers","chaturbate","stripchat","fansly","manyvids","nsfw"]],
  ["dating",    ["tinder","hinge","bumble","okcupid","match.com","grindr","plenty of fish","pof.com","badoo","coffee meets bagel","happn","feeld","raya","jeevansathi","shaadi.com","bharat matrimony","bharatmatrimony","trulymadly","truly madly","quack quack","aisle"]],
  // Distinct apps/sites
  ["instagram", ["instagram"]],
  ["linkedin",  ["linkedin"]],
  ["meet",      ["zoom.us","zoom meeting","meet.google","google meet","microsoft teams","teams meeting","webex","whereby","gotomeeting","bluejeans","jitsi","- meet -"]],
  ["banking",   [
    // US / global banks
    "chase","bank of america","wells fargo","citibank","citi.com","capital one","us bank","u.s. bank","td bank","truist","ally bank","barclays","hsbc","santander","navy federal","usaa","sofi","regions bank","fifth third","huntington","citizens bank","key bank","comerica","american express","amex","deutsche bank","standard chartered","rbc royal","scotiabank","commonwealth bank","natwest","lloyds bank","monzo","revolut","n26","nubank","wise.com","credit union",
    // India banks
    "state bank of india","onlinesbi","yono","hdfc bank","hdfc","icici bank","icici","axis bank","kotak","punjab national","bank of baroda","canara bank","union bank of india","idbi","yes bank","indusind","federal bank","idfc first","bandhan bank","rbl bank","au small finance","bank of india","central bank of india","indian bank","uco bank","indian overseas bank","south indian bank","karur vysya","city union bank","imobile",
    // investing / fintech
    "fidelity","vanguard","charles schwab","robinhood","coinbase","kraken","binance","e*trade","etrade","paypal","venmo","cash app","zelle","google pay","paytm","phonepe","razorpay","groww","zerodha","kite.zerodha","upstox","angel one","et money","mobikwik","freecharge","jupiter money","fi money","5paisa","icici direct","hdfc securities","kotak securities",
    // generic banking terms
    "brokerage","online banking","net banking","netbanking","internet banking","- banking","account summary","account balance","routing number","ifsc","beneficiary","fund transfer","wire transfer","transfer funds","bill pay","mini statement","account statement","my accounts","passbook",
  ]],
  ["form",      ["typeform","google forms","forms.gle","microsoft forms","surveymonkey","jotform","formstack","tally.so","cognito forms","wufoo","- survey","- form","questionnaire","feedback form","registration form","application form","sign up","create account"]],
  ["food",      ["doordash","uber eats","ubereats","grubhub","instacart","seamless","postmates","caviar","chownow","skipthedishes","menulog","glovo","rappi","swiggy","zomato","deliveroo","just eat","foodpanda","talabat","blinkit","bigbasket","zepto","dunzo","magicpin","dineout","eatstreet"]],
  ["maps",      ["google maps","maps.google","apple maps","- maps","openstreetmap","waze","mapquest","bing maps","here wego","citymapper","mapmyindia","mappls","rome2rio","directions to"]],
  ["calendar",  ["google calendar","calendar.google","outlook calendar","fantastical","calendly","proton calendar","zoho calendar","teamup","- calendar"]],
  ["wiki",      ["wikipedia","- wiki","fandom","britannica","wikihow","wiktionary","wikimedia"]],
  ["news",      ["bbc","cnn","the new york times","nytimes","the guardian","reuters","techcrunch","the verge","ap news","washington post","wall street journal","wsj","bloomberg","fox news","nbc news","cbs news","abc news","usa today","los angeles times","financial times","the economist","politico","axios","cnbc","forbes","npr","al jazeera","times of india","timesofindia","the hindu","hindustan times","ndtv","indian express","india today","economic times","business standard","livemint","news18","zee news","republic world","the print","scroll.in","firstpost","deccan herald","- news","breaking news"]],
  ["email",     ["gmail","inbox (","outlook.com","outlook.office","yahoo mail","proton mail","protonmail","fastmail","hey.com","zoho mail","rediffmail","icloud mail","gmx mail","aol mail","tutanota","- mail"]],
  ["search",    ["google search","- google search","google.com/search","- bing","bing.com/search","duckduckgo","yahoo search","ecosia","startpage","brave search","yandex","baidu","qwant","- search","search results"]],
  // Entertainment / commerce contexts
  ["shopping",  ["amazon","ebay","etsy","shopify","aliexpress","walmart","target","best buy","flipkart","online shopping site for mobiles","myntra","ajio","meesho","snapdeal","nykaa","tata cliq","tatacliq","jiomart","reliance digital","croma","firstcry","pepperfry","urban ladder","lenskart","purplle","limeroad","snitch","bewakoof","pharmeasy","1mg","shein","temu","alibaba","rakuten","mercado libre","mercadolibre","lazada","shopee","zalando","asos","wayfair","newegg","costco","ikea","argos","nordstrom","macys","home depot","lowes","banggood","overstock","chewy","sephora","decathlon","add to cart","add to bag","add to basket","wishlist","- shop"]],
  ["video",     ["youtube","netflix","hulu","vimeo","disney+","disneyplus","hbo max","max -","prime video","peacock","crunchyroll","hotstar","jiocinema","jio cinema","sonyliv","zee5","voot","mx player","apple tv+","paramount+","discovery+","youtube tv","dailymotion","rumble","bilibili","tubi","plex","mubi","- watch"]],
  ["music",     ["spotify","apple music","amazon music","soundcloud","bandcamp","tidal","pandora","music.youtube","youtube music","deezer","gaana","jiosaavn","saavn","wynk","hungama","iheartradio","audiomack","qobuz","last.fm","- music"]],
  ["gaming",    ["twitch","steam","epic games","battle.net","roblox","game pass","xbox","playstation","itch.io","gog galaxy","ubisoft connect","ea app","riot games","league of legends","valorant","minecraft","fortnite","genshin","call of duty","nintendo","ign","gamespot","miniclip","crazygames","chess.com","lichess","dream11","- game"]],
  ["social",    ["reddit","twitter","x.com"," / x"," r/","— reddit","- reddit","mastodon","threads","bluesky","facebook","tiktok","tumblr","pinterest","snapchat","quora","9gag","imgur","weibo","vk.com","sharechat"]],
  ["chatting",  ["discord","whatsapp","slack","telegram","messenger","imessage","messages","signal","wechat","viber","skype","google chat","hangouts","mattermost","rocket.chat","- chat"]],
  ["coding",    ["visual studio code","vscode","github.com","gitlab.com","bitbucket","stack overflow","stackoverflow","stack exchange","replit","repl.it","codesandbox","codepen","stackblitz","leetcode","hackerrank","codewars","codeforces","codechef","hackerearth","jsfiddle","glitch.com","geeksforgeeks","w3schools","mdn web docs","developer.mozilla","dev.to","hashnode","kaggle","jupyter","google colab","colab.research","npmjs.com","pypi.org","crates.io","docker hub","vercel","netlify","heroku","console.aws","azure portal","cloud.google","firebase","supabase","mongodb atlas","localhost:","127.0.0.1",
    // distinctive editor / IDE product names (caught even mid-title, e.g. "main.py — Antigravity")
    "antigravity","kiro","intellij","pycharm","webstorm","goland","rubymine","phpstorm","datagrip","jetbrains","android studio","sublime text","xcode","rstudio","qt creator"]],
  ["typing",    ["google docs","microsoft word","- word","notion","textedit","- pages","compose","obsidian","scrivener","overleaf","google keep","evernote","zoho writer","dropbox paper","confluence","quip","roam research","grammarly","notes"]],
];

// App-name contexts for NATIVE apps. The backend prepends the frontmost app's
// name to the window title ("appname windowtitle"), so native apps are matched
// by their leading app name — the string equals the name or starts with
// "name ". This is SAFE against browser false-positives: browser content is
// always prefixed with the browser's own name (e.g. "google chrome <tab>"), so
// a web page titled "Promo code" never starts with "code ". Checked BEFORE the
// keyword list. Names are lowercased to match the backend's lowercased string.
// NOTE: if a specific app still falls through, run `npm run dev` from a terminal
// and read the `[cursa] fg-window: …` log line — that is the exact string this
// matches against — then add its leading token here.
const APP_NAME_CONTEXTS = [
  ["coding",     ["code","cursor","kiro","antigravity","electron","windsurf","trae","void","zed",
                  "fleet","positron","nova","pulsar","atom","brackets","textmate","bbedit",
                  "coderunner","xcode","visual studio","android studio","sublime text",
                  "intellij idea","pycharm","webstorm","goland","rubymine","clion",
                  "phpstorm","rider","datagrip","appcode","rustrover","aqua","dataspell",
                  "rstudio","spyder","eclipse","netbeans","qt creator","lapce","helix",
                  "geany","onivim","github desktop","sourcetree","tower","fork","gitkraken",
                  "terminal","iterm","iterm2","ghostty","warp","alacritty","kitty",
                  "wezterm","hyper","tabby","rio","neovim","nvim","macvim","vim","emacs"]],
  ["calculator", ["calculator","pcalc","soulver","calca","numi","calcbot"]],
  ["calendar",   ["calendar","fantastical","busycal","cron","amie","morgen"]],
  ["typing",     ["textedit","pages","notes","notion","obsidian","bear","ulysses","ia writer",
                  "typora","scrivener","drafts","craft","logseq","joplin","evernote",
                  "microsoft word","bike","nota","roam"]],
  ["email",      ["mail","spark","airmail","mimestream","canary mail","microsoft outlook",
                  "outlook","thunderbird","proton mail","newton"]],
  ["music",      ["music","spotify","cider","tidal","deezer"]],
  ["video",      ["tv","quicktime player","vlc","iina","mpv","infuse","elmedia"]],
  ["chatting",   ["messages","discord","slack","telegram","whatsapp","signal","messenger",
                  "element","wechat","viber","skype"]],
  ["meet",       ["facetime","zoom.us","zoom","webex","microsoft teams"]],
  ["gaming",     ["steam","epic games","battle.net","gog galaxy","ea app","riot client",
                  "league of legends","minecraft","roblox"]],
  ["maps",       ["maps"]],
];

const FLINCH_KEYWORDS = ["trash","delete","move to bin","recycle bin","empty trash"];

// Contexts whose held object already performs its own periodic action — these
// opt out of the generic "fidget bob" so the two motions don't fight.
const CUSTOM_ACTION_CTX = new Set([
  "coding","social","video","maps","news","instagram","calendar","calculator",
  "search","form","nsfw","checkout",
]);

function matchesAppName(title, name) {
  return title === name || title.startsWith(name + " ");
}

function classifyContext(title) {
  if (!title) return "idle";
  // 1) Native-app contexts via leading app name (e.g. "code …", "calendar …").
  for (const [ctx, names] of APP_NAME_CONTEXTS) {
    if (names.some((n) => matchesAppName(title, n))) return ctx;
  }
  // 2) Web/page contexts via substring keyword match on the tab title.
  for (const [ctx, words] of CONTEXT_KEYWORDS) {
    if (words.some((w) => title.includes(w))) return ctx;
  }
  return "idle";
}

function approach(current, target, rate, dt) {
  const k = 1 - Math.pow(1 - rate, dt / (1000 / 60));
  return current + (target - current) * k;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Transient (ONE-SHOT) events: name → duration(ms). The hand pose (if any) and
// eye effects are resolved in update(). Priority array controls which active
// transient owns the hands when several overlap.
// ---------------------------------------------------------------------------
const EVENT_DUR = {
  click: 300, dblclick: 480, rightclick: 1800, drop: 600,
  copy: 650, paste: 600, undo: 800, highlight: 750, screenshot: 950,
  print: 1600, fistpump: 950, downloadcomplete: 2000, success: 3000,
  zoomin: 700, zoomout: 700, notif: 950, newwindow: 1000,
  fastscroll: 700, spark: 1300, volmax: 2000, blanket: 2600, awe: 2200,
  __sip: 2000, // internal: coffee sip lift (no hand pose of its own)
};
// event → hand pose (null = eyes only / keep current hands)
const EVENT_POSE = {
  click: "head-pat", dblclick: "head-pat", rightclick: "menu-card", drop: "drop-release",
  copy: "paper-grab", paste: "paper-slap", undo: "wave", highlight: "highlighter",
  screenshot: "camera", print: "print-present", fistpump: "fist-pump",
  downloadcomplete: "celebrate", success: "confetti-throw",
  notif: "chest-hand", fastscroll: "grip-sides", spark: "lightning",
  volmax: "ears-cover", blanket: "blanket", awe: "awe-spread",
  zoomin: null, zoomout: null, newwindow: null,
};
// Highest priority first.
const EVENT_PRIORITY = [
  "success","downloadcomplete","blanket","awe","print","screenshot","fistpump",
  "spark","volmax","notif","drop","paste","copy","undo","highlight",
  "rightclick","dblclick","click","fastscroll","zoomin","zoomout","newwindow",
];

export class Personality {
  constructor() {
    // ---- renderer outputs ----
    this.scale       = 1.35;
    this.lookX = 0; this.lookY = 0;
    this.openL = 1; this.openR = 1;
    this.wide = 0; this.squint = 0; this.lid = 0;
    this.glassesSun = 0; this.glassesRead = 0; this.glasses3D = 0;
    this.browWhite = 0; this.cane = 0; this.mouthOpen = 0; this.sweat = 0;
    this.babyEyes = 0; this.wrinkles = 0; this.darkBags = 0; this.hunched = 0;
    this.blush = 0; this.pale = 0; this.tie = 0;
    this.headphones = 0; this.propBob = 0;

    // hands
    this.handsOut = 0; this.prop = null;
    this.propPhase = 0;  // 0..1 cyclic (loops)
    this.propAnim  = 0;  // 0..1 one-shot progress
    this.punchDouble = false; // dblclick → two jabs
    this.handDX = 0; this.handDY = 0; // movement-physics offset

    // particle / flag outputs
    this.context = "idle"; this.stageName = "baby";
    this.asleep = false; this.shopping = false; this.sleeping = false;
    this.playingMusic = false; this.throwingConfetti = false;
    this.celebrating = false; this.sparking = false;
    this.screenshotFlash = 0; this.notifPop = 0;
    this.moving = false;

    // ---- internal ----
    this._idleMs = 0;
    this._blinkTimer = this._nextBlink(1); this._blinking = 0;
    this._wanderPhase = Math.random() * TAU;
    this._flinchMs = 0; this._flinchCooldown = 0;
    this._speed = 0; this._lastTitle = ""; this._flinchHot = false;

    // context one-shot / loop tracking
    this._prevContext = null; this._contextTimer = 0;
    this._oneShotDone = false; this._idleRepeatTimer = 0;
    this._propPhaseTimer = 0;

    // checkout twitch
    this._twitchCooldown = 10000; this._twitchActive = false; this._twitchMs = 0;

    // startup toothbrush one-shot
    this._startupTimer = 0; this._startupDone = false;

    // transient events: name -> remaining ms
    this._ev = {};

    // held states
    this.held = {
      moving: false, scrolling: false, typing: false,
      mouseDown: false, dragging: false, fileDragging: false,
      lowBattery: false, highCpu: false, muted: false, downloading: false,
    };
    this._scrollMs = 0; this._typingMs = 0;
    this._scrollBurstMs = 0; this._scrollCount = 0;

    // generic prop "fidget": every 15–20s of idle prop-holding, do a small bob
    this._fidgetCooldown = 8000 + Math.random() * 4000; this._fidgetMs = 0;
    // newspaper reading scan (every ~10s)
    this._readCooldown = 4000; this._readMs = 0;
  }

  _nextBlink(slowMult = 1) { return (4000 + Math.random() * 4000) * slowMult; }

  // ---- input API ----------------------------------------------------------
  setTitle(title) {
    const t = (title || "").toLowerCase();
    this._lastTitle = t;
    this.context = classifyContext(t);
    this._flinchHot = FLINCH_KEYWORDS.some((w) => t.includes(w));
  }
  fireEvent(name) {
    if (EVENT_DUR[name] == null) return;
    this._ev[name] = EVENT_DUR[name];
    if (name === "screenshot") this.screenshotFlash = 1;
    if (name === "notif") this.notifPop = 1;
  }
  setHeld(name, val) { if (name in this.held) this.held[name] = !!val; }
  onScroll(_dy) {
    // "Scrolling" stays active for a short window after each event (→ tuck).
    this._scrollMs = 400;
    // Fast scroll = a rapid burst of scroll events (device-independent).
    this._scrollBurstMs = 200;
    this._scrollCount += 1;
    if (this._scrollCount >= 5) { this.fireEvent("fastscroll"); this._scrollCount = 0; }
  }
  onTyping() { this._typingMs = 5000; }

  _evActive(name) { return (this._ev[name] || 0) > 0; }
  _evProgress(name) {
    const d = EVENT_DUR[name]; if (!d) return 0;
    return clamp01(1 - (this._ev[name] || 0) / d);
  }

  // ---- main update --------------------------------------------------------
  update(dt, input) {
    dt = Math.max(0, Math.min(dt, 100));

    if (window.cursaForce?.retriggerStartup) {
      this._startupDone = false; this._startupTimer = 0; this._propPhaseTimer = 0;
      window.cursaForce.retriggerStartup = false;
    }

    // ---- age ----
    const forceStage = window.cursaForce?.stage;
    const STAGE_HOURS = { baby:7, adult:13, mature:19, old:22, "very-tired":23, grandpa:2 };
    const hour = forceStage ? (STAGE_HOURS[forceStage] ?? new Date().getHours()) : new Date().getHours();
    const stage = stageForHour(hour);
    this.stageName = stage.name;

    // ---- motion / idle ----
    this._speed = approach(this._speed, input.speed, 0.35, dt);
    const physicallyMoving = this._speed > 0.04;
    if (input.moved && input.speed > 0.06) this._idleMs = 0; else this._idleMs += dt;

    // expire scroll/typing windows
    this._scrollMs = Math.max(0, this._scrollMs - dt);
    this._typingMs = Math.max(0, this._typingMs - dt);
    this._scrollBurstMs = Math.max(0, this._scrollBurstMs - dt);
    if (this._scrollBurstMs === 0) this._scrollCount = 0;
    this.held.scrolling = this._scrollMs > 0;
    this.held.typing = this._typingMs > 0;

    const moving = physicallyMoving || this.held.moving;
    this.moving = moving;

    // ---- advance transient timers ----
    for (const k in this._ev) {
      this._ev[k] -= dt;
      if (this._ev[k] <= 0) delete this._ev[k];
    }
    this.screenshotFlash = Math.max(0, this.screenshotFlash - dt / 220);
    this.notifPop = Math.max(0, this.notifPop - dt / 300);

    // ---- context change ----
    if (window.cursaForce?.context) this.context = window.cursaForce.context;
    if (this.context !== this._prevContext) {
      this._prevContext = this.context;
      this._contextTimer = 0; this._oneShotDone = false;
      this._idleRepeatTimer = 0; this._propPhaseTimer = 0; this.propPhase = 0;
    }
    this._contextTimer += dt;
    if (!moving) this._idleRepeatTimer += dt;

    // ---- target accumulators ----
    let tWide = 0, tSquint = 0, tSun = 0, t3D = 0;
    let tRead = stage.glasses === "reading" ? 1 : 0;
    let tMouth = 0, tSweat = 0;
    let tBaby = stage.baby ? 1 : 0, tWrinkles = stage.wrinkles ? 1 : 0;
    let tBags = stage.bags ? 1 : 0, tHunched = stage.hunched ? 1 : 0;
    let tBlush = 0, tPale = 0, tTie = 0;
    let tHeadphones = 0;
    let restLid = stage.restLid, slowMult = stage.slow;
    let lookX = 0, lookY = 0;
    let leanScale = 0;       // zoom lean (+in / -out)
    let dartPhase = null;    // eyes darting
    let winkR = 0;           // right-eye wink (screenshot)
    let eyeRoll = 0;         // undo

    // page-prop intent (persistent hands holding something)
    let pageProp = null, pagePropHands = 0;

    this.shopping = this.sleeping = this.asleep = false;
    this.playingMusic = this.throwingConfetti = this.celebrating = this.sparking = false;

    // eye tracking follows motion
    if (moving) {
      const mag = Math.hypot(input.vx, input.vy) || 1;
      lookX = input.vx / mag; lookY = input.vy / mag;
    }

    // ================= CONTEXT (page/app) reactions =================
    const idleCtx = this.context === "idle";
    switch (this.context) {
      case "shopping":   this.shopping = true; pageProp = "basket"; pagePropHands = 1; tWide = 0.2; break;
      case "video":      t3D = 1; tSquint = 0.3; lookX *= 0.3; lookY *= 0.3;       // 9: puts the 3D glasses ON with its hands
                         if (!this._oneShotDone) {
                           pageProp = "glasses-place"; pagePropHands = 1;
                           if (this._contextTimer > 1600) this._oneShotDone = true;
                         } else if (!moving && this._idleRepeatTimer > 18000) {     // nudges them up every ~18s
                           pageProp = "glasses-place"; pagePropHands = 1;
                           if (this._idleRepeatTimer > 19200) this._idleRepeatTimer = 0;
                         }
                         break;
      case "music":      this.playingMusic = true; tHeadphones = 1; lookX = Math.sin(input.now * 0.00065) * 0.7; tSquint = 0.18; break;
      case "gaming":     pageProp = "controller"; pagePropHands = 1; tWide = 0.3; tSquint = 0.15; break;
      case "social":     pageProp = "popcorn"; pagePropHands = 1; tWide = 0.15;     // 11: eats ~4s after idle, then every ~10s
                         { const next = this._oneShotDone ? 10000 : 4000;
                           if (!moving && this._idleRepeatTimer > next) {
                             const e = clamp01((this._idleRepeatTimer - next) / 1200);
                             this.propPhase = e; tMouth = Math.sin(e * Math.PI) * 0.85; // mouth opens at the bite
                             if (e >= 1) { this._idleRepeatTimer = 0; this._oneShotDone = true; }
                           } else { this.propPhase = 0; } }
                         break;
      case "typing":     tSquint = 0.7; tSweat = this._speed < 0.02 ? 0.4 : 0; break;
      case "chatting":   tSquint = 0.25; break;
      case "coding":     // 26: coffee + pen; sips ~4s after going idle, then every ~10s
                         pageProp = "coffee-pen"; pagePropHands = 1; tSquint = 0.25;
                         { const next = this._oneShotDone ? 10000 : 4000;
                           if (!moving && this._idleRepeatTimer > next) { this.fireEvent("__sip"); this._idleRepeatTimer = 0; this._oneShotDone = true; } }
                         break;
      case "calculator": // holds a calculator and taps the keys, brow furrowed
                         pageProp = "calculator"; pagePropHands = 1; tSquint = 0.35;
                         if (!moving) this._propPhaseTimer += dt;
                         this.propPhase = (this._propPhaseTimer % 1400) / 1400; break;
      case "checkout":   // 13: wallet + nervous eye twitch every 10s idle
                         pageProp = "wallet"; pagePropHands = 1; tWide = 0.4; tSweat = 0.5;
                         this._twitchCooldown -= dt;
                         if (!moving && this._twitchCooldown <= 0 && !this._twitchActive) { this._twitchActive = true; this._twitchMs = 220; this._twitchCooldown = 10000; }
                         if (this._twitchActive) { this._twitchMs -= dt; if (this._twitchMs <= 0) this._twitchActive = false; }
                         break;
      case "banking":    pageProp = "briefcase"; pagePropHands = 1; break;          // 14: one-shot pull-out (arms extend), stays
      case "search":     // 15: scan gesture, retract, repeat 20s idle
                         pageProp = "scan";
                         if (!this._oneShotDone) { pagePropHands = 1; if (this._contextTimer > 2200) this._oneShotDone = true; }
                         else if (this._idleRepeatTimer > 20000) { pagePropHands = 1; if (this._idleRepeatTimer > 22200) this._idleRepeatTimer = 0; }
                         else pagePropHands = 0;
                         break;
      case "email":      pageProp = "envelope"; pagePropHands = 1; break;           // 16: envelope stays
      case "news":       pageProp = "newspaper"; pagePropHands = 1;                  // 17: persistent, reads every ~10s
                         if (!moving) {
                           if (this._readMs > 0) {                  // a 2s reading scan
                             this._readMs -= dt;
                             const p = 1 - this._readMs / 2000;
                             lookY = 0.5;                           // look down at the paper
                             lookX = (((p * 2) % 1) - 0.5) * 1.2;   // sweep left→right, two lines
                             if (this._readMs <= 0) this._readCooldown = 10000;
                           } else {
                             lookY = 0.32;                          // resting gaze on the paper
                             this._readCooldown -= dt;
                             if (this._readCooldown <= 0) this._readMs = 2000;
                           }
                         }
                         break;
      case "wiki":       tRead = 1;                                                  // 18: glasses placed, stay
                         if (!this._oneShotDone) { pageProp = "glasses-place"; pagePropHands = 1; if (this._contextTimer > 1800) this._oneShotDone = true; }
                         else pagePropHands = 0;
                         break;
      case "maps":       pageProp = "compass"; pagePropHands = 1;                   // 19: looks around every ~15s
                         if (!moving && this._idleRepeatTimer > 15000) {
                           const e = clamp01((this._idleRepeatTimer - 15000) / 1800);
                           lookX = Math.sin(e * Math.PI * 2) * 0.75; lookY = 0.15;
                           if (e >= 1) this._idleRepeatTimer = 0;
                         }
                         break;
      case "calendar":   pageProp = "clipboard"; pagePropHands = 1;                 // 20: clipboard + tap intro
                         if (!this._oneShotDone) { this._propPhaseTimer += dt; this.propPhase = clamp01(this._propPhaseTimer / 1800); if (this._contextTimer > 1800) this._oneShotDone = true; }
                         break;
      case "food":       // 21: belly rub + thumbs up, retract
                         if (!this._oneShotDone) { pageProp = "belly-thumbs"; pagePropHands = 1; this._propPhaseTimer += dt; this.propPhase = (this._propPhaseTimer % 1100) / 1100; if (this._contextTimer > 2200) this._oneShotDone = true; }
                         else pagePropHands = 0;
                         break;
      case "dating":     tBlush = 0.7;                                               // 22: cover eyes 3s, uncover, blush stays
                         if (!this._oneShotDone) { pageProp = "cover-eyes"; pagePropHands = 1; if (this._contextTimer > 3000) this._oneShotDone = true; }
                         else pagePropHands = 0;
                         break;
      case "nsfw":       tBlush = 1; pageProp = "cover-eyes"; pagePropHands = 1;     // 23: cover + peek every 15s
                         if (!moving) this._propPhaseTimer += dt; this.propPhase = (this._propPhaseTimer % 15000) / 15000; break;
      case "linkedin":   // 24: blazer smooth (intro), then a tie stays on — professional
                         tTie = 1;
                         if (!this._oneShotDone) { pageProp = "blazer"; pagePropHands = 1; this._propPhaseTimer += dt; this.propPhase = (this._propPhaseTimer % 1000) / 1000; if (this._contextTimer > 2000) this._oneShotDone = true; }
                         else pagePropHands = 0;
                         break;
      case "instagram":  pageProp = "camera"; pagePropHands = 1;                     // 25: camera stays, snap every 25s
                         if (!this._oneShotDone) { this._propPhaseTimer += dt; this.propPhase = (this._propPhaseTimer % 1800) / 1800; if (this._contextTimer > 1800) { this._oneShotDone = true; } }
                         if (!moving && this._idleRepeatTimer > 25000) { this._propPhaseTimer = 0; this.propPhase = 0; this._idleRepeatTimer = 0; }
                         break;
      case "meet":       tWide = 0.6; tTie = 1;                                       // 27: tie fix + alert, tie stays
                         if (!this._oneShotDone) { pageProp = "blazer"; pagePropHands = 1; this._propPhaseTimer += dt; this.propPhase = (this._propPhaseTimer % 1000) / 1000; if (this._contextTimer > 2000) this._oneShotDone = true; }
                         else pagePropHands = 0;
                         break;
      case "form":       pageProp = "pen"; pagePropHands = 1;                        // 28: pen scribble, repeat 20s
                         { const scribbling = !this._oneShotDone || (!moving && this._idleRepeatTimer > 20000);
                           if (scribbling) { this._propPhaseTimer += dt; this.propPhase = (this._propPhaseTimer % 1400) / 1400; if (this._contextTimer > 1400 && this._idleRepeatTimer > 20000) this._idleRepeatTimer = 0; if (this._contextTimer > 1400) this._oneShotDone = true; }
                           else this.propPhase = 0; }
                         break;
      case "success":    if (!this._oneShotDone) { this.fireEvent("success"); this._oneShotDone = true; } break; // 29: confetti once, returns to neutral after 3s
      default: break;
    }
    // coffee sip uses propAnim-lite: a transient "__sip" raises the cup
    const sipping = this._evActive("__sip");
    if (sipping) tMouth = Math.max(tMouth, Math.sin(this._evProgress("__sip") * Math.PI) * 0.7); // mouth opens to drink

    // ----- generic prop "fidget": every ~15–20s while idle holding a persistent
    // prop, play a brief bob/lift so the held object isn't just static. -------
    const holdingProp = !!pageProp && pagePropHands > 0 && !CUSTOM_ACTION_CTX.has(this.context);
    if (holdingProp && !moving) {
      if (this._fidgetMs > 0) {
        this._fidgetMs -= dt;
        if (this._fidgetMs <= 0) this._fidgetCooldown = 15000 + Math.random() * 5000;
      } else {
        this._fidgetCooldown -= dt;
        if (this._fidgetCooldown <= 0) this._fidgetMs = 650;
      }
    } else { this._fidgetMs = 0; }
    const tBob = this._fidgetMs > 0 ? Math.sin((1 - this._fidgetMs / 650) * Math.PI) : 0;

    // ================= IDLE tiers (cases 35–37) — only in idle context =======
    let idlePose = null;
    if (idleCtx && !moving) {
      if (this._idleMs > 30000) {            // 37: sleep, Zzz, limp hands, loops
        this.sleeping = true; this.asleep = true; tMouth = 0.5; restLid = 1; idlePose = "limp";
      } else if (this._idleMs > 10000) {     // 36: hand props under face
        idlePose = "under-face";
        this._wanderPhase += dt * 0.0011; lookX = Math.cos(this._wanderPhase) * 0.4; lookY = 0.25;
      } else if (this._idleMs > 5000) {      // 35: hands fade back in (neutral)
        this._wanderPhase += dt * 0.0016; lookX = Math.cos(this._wanderPhase) * 0.7; lookY = Math.sin(this._wanderPhase * 0.7) * 0.5;
      }
    }

    // ================= STARTUP one-shot (case 1) =============================
    let startupPose = null, startupHands = 0, startupActive = false;
    if (!this._startupDone) {
      this._startupTimer += dt; const t = this._startupTimer; startupActive = true;
      const ARM_IN = 700, ARM_OUT = 5000;   // brush ~3.3s, 5s total
      startupPose = "toothbrush";
      if      (t < ARM_IN)         startupHands = t / ARM_IN;
      else if (t > ARM_OUT - 1000) startupHands = Math.max(0, 1 - (t - (ARM_OUT - 1000)) / 1000);
      else                         startupHands = 1;
      const brushing = startupHands > 0.8 && t > ARM_IN && t < ARM_OUT - 1000;
      if (brushing) { this._propPhaseTimer += dt; this.propPhase = (this._propPhaseTimer % 700) / 700; }
      if (t >= ARM_OUT) { this._startupDone = true; startupActive = false; }
    }

    // ================= EVENT (transient) eye + flag effects ==================
    let evPose = null, evAnim = 0;
    for (const name of EVENT_PRIORITY) {
      if (this._evActive(name)) {
        const pose = EVENT_POSE[name];
        if (pose && evPose === null) { evPose = pose; evAnim = this._evProgress(name); }
      }
    }
    if (this._evActive("success"))   { this.throwingConfetti = true; tWide = 1; }
    if (this._evActive("downloadcomplete")) { this.celebrating = true; tWide = 0.6; }
    if (this._evActive("fistpump"))  { tWide = 0.5; }
    if (this._evActive("spark"))     { tWide = 0.6; }   // held lightning bolt (no particles)
    if (this._evActive("awe"))       { tWide = 1; }
    if (this._evActive("notif"))     { tWide = 1; }
    if (this._evActive("newwindow")) { dartPhase = input.now * 0.012; }
    if (this._evActive("fastscroll")){ tWide = 0.8; }
    if (this._evActive("volmax"))    { tSquint = Math.max(tSquint, 0.7); }
    if (this._evActive("zoomin"))    { tWide = Math.max(tWide, 0.7); leanScale = 0.18 * Math.sin(this._evProgress("zoomin") * Math.PI); }
    if (this._evActive("zoomout"))   { tSquint = Math.max(tSquint, 0.5); leanScale = -0.14 * Math.sin(this._evProgress("zoomout") * Math.PI); }
    if (this._evActive("undo"))      { eyeRoll = Math.sin(this._evProgress("undo") * Math.PI); }
    if (this._evActive("screenshot")){ winkR = Math.sin(this._evProgress("screenshot") * Math.PI); }
    if (this._evActive("blanket"))   { restLid = Math.max(restLid, 0.75); }

    // ================= HELD system states (persistent) =======================
    if (this.held.lowBattery) { tPale = 1; }
    let heldPose = null, heldHands = 0, heldPhase = null;
    if (this.held.muted)      { heldPose = "shush"; heldHands = 1; }
    else if (this.held.lowBattery) { heldPose = "clutch-chest"; heldHands = 1; heldPhase = (input.now % 15000) / 15000; }
    else if (this.held.highCpu)    { heldPose = "wipe"; heldHands = 1; tSweat = Math.max(tSweat, 0.8); heldPhase = (input.now % 2200) / 2200; } // wipes brow with a cloth
    else if (this.held.downloading){ heldPose = "watch-tap"; heldHands = 1; heldPhase = (input.now % 8000) / 8000; }

    // ================= HAND POSE RESOLUTION (priority) =======================
    // 1 startup · 2 transient · 3 drag/hold · 4 move/scroll/type tuck ·
    // 5 held-system · 6 page-prop · 7 idle-tier · 8 neutral rest
    let pose = null, handsOut = 0, anim = 0, phase = null;

    if (startupActive) {
      pose = startupPose; handsOut = startupHands; phase = this.propPhase;
    } else if (evPose) {
      pose = evPose; handsOut = 1; anim = evAnim;
      if (evPose === "punch" && this._evActive("dblclick")) anim = this._evProgress("dblclick"); // doubled jab handled in renderer
    } else if (this.held.dragging || this.held.fileDragging) {
      pose = this.held.fileDragging ? "box-carry" : "drag-strain"; handsOut = 1;
      phase = (input.now % 900) / 900;
    } else if (this.held.mouseDown) {
      pose = "grip-hold"; handsOut = 1;
    } else if (moving || this.held.scrolling || this.held.typing) {
      pose = "tuck"; handsOut = 0; // cases 30, 46, 48
    } else if (heldPose) {
      pose = heldPose; handsOut = heldHands; phase = heldPhase;
    } else if (pageProp && pagePropHands > 0) {
      pose = pageProp; handsOut = 1; phase = this.propPhase;
      if (sipping) { pose = "coffee-pen"; anim = this._evProgress("__sip"); } // 0→1 over the sip; pose lifts via sin(anim·π)
    } else if (idlePose) {
      pose = idlePose; handsOut = idlePose === "limp" ? 1 : 1;
    } else if (idleCtx && this._idleMs > 5000) {
      pose = "rest"; handsOut = 0.85; // 35: hands fade in
    } else {
      pose = null; handsOut = 0;
    }

    // aged stages: when idle with free hands, rest them so the left-hand cane reads as held
    if (stage.cane && !moving && (pose === null)) { pose = "rest"; handsOut = 0.9; }

    // ================= movement physics (cases 31–34) ========================
    // Hands lag opposite to motion, then spring back to rest.
    const tgtDX = clamp01(Math.min(Math.abs(input.vx) * 0.05, 1)) * -Math.sign(input.vx) * 6;
    const tgtDY = clamp01(Math.min(Math.abs(input.vy) * 0.05, 1)) * -Math.sign(input.vy) * 6;
    this.handDX = approach(this.handDX, tgtDX, 0.35, dt);
    this.handDY = approach(this.handDY, tgtDY, 0.35, dt);

    // ---- dev overrides ----
    if (window.cursaForce?.prop != null) { pose = window.cursaForce.prop || null; handsOut = pose ? 1 : 0; }
    if (window.cursaForce?.bags)      tBags = 1;
    if (window.cursaForce?.wrinkles)  tWrinkles = 1;
    if (window.cursaForce?.babyEyes)  tBaby = 1;
    if (window.cursaForce?.slowBlink) slowMult = 4;
    if (window.cursaForce?.hunched)   tHunched = 1;
    if (window.cursaForce?.blush)     tBlush = 1;
    if (window.cursaForce?.pale)      tPale = 1;
    if (window.cursaForce?.tie)       tTie = 1;
    if (window.cursaForce?.headphones) tHeadphones = 1;
    if (window.cursaForce?.forceSun)  tSun = 1;
    if (window.cursaForce?.force3D)   t3D = 1;
    if (window.cursaForce?.forceRead) tRead = 1;

    // ================= flinch (destructive target) ==========================
    this._flinchCooldown -= dt;
    if (this._flinchHot && this._flinchCooldown <= 0 && this._flinchMs <= 0) { this._flinchMs = 320; this._flinchCooldown = 1400; }
    let flinch = 0;
    if (this._flinchMs > 0) { this._flinchMs -= dt; flinch = Math.max(0, Math.sin((1 - this._flinchMs / 320) * Math.PI)); }

    // ================= blink ================================================
    let blink = 0;
    if (!this.asleep) {
      const dur = 130 * Math.max(1, slowMult * 0.9);
      this._blinkTimer -= dt;
      if (this._blinkTimer <= 0 && this._blinking <= 0) { this._blinking = dur; this._blinkTimer = this._nextBlink(slowMult); }
      if (this._blinking > 0) { this._blinking -= dt; blink = Math.max(0, Math.sin((1 - this._blinking / dur) * Math.PI)); }
    }

    // ================= compose openness =====================================
    let baseOpen = 1 - restLid * 0.85;
    baseOpen *= (1 - tSquint * 0.55);
    baseOpen *= (1 - blink) * (1 - flinch);
    baseOpen += tWide * (1 - baseOpen) * 0.9;
    baseOpen = clamp01(baseOpen);
    if (eyeRoll > 0) baseOpen = clamp01(baseOpen + eyeRoll * 0.1); // wide-ish during roll
    if (this.asleep) baseOpen = 0;

    let targetOpenL = baseOpen, targetOpenR = baseOpen;
    if (this.context === "checkout" && this._twitchActive) targetOpenL = 0;        // 13 twitch
    if (winkR > 0.4) targetOpenR = 0;                                              // 57 wink

    // eyes darting (newwindow): override lookX with fast oscillation
    if (dartPhase != null) { lookX = Math.sin(dartPhase) * 0.9; lookY = 0; }
    // eyeRoll: eyes roll up-around
    if (eyeRoll > 0.1) { lookX = Math.cos(eyeRoll * Math.PI) * 0.6; lookY = -0.7 * eyeRoll; }

    // ================= ease everything ======================================
    this.punchDouble = this._evActive("dblclick");
    this.prop = pose; this.propAnim = anim;
    if (phase != null) this.propPhase = phase;
    this.handsOut = approach(this.handsOut, handsOut, 0.16, dt);

    this.scale      = approach(this.scale, 1.35 * (1 + leanScale), 0.22, dt);
    this.openL      = approach(this.openL, targetOpenL, this._twitchActive ? 0.75 : 0.5, dt);
    this.openR      = approach(this.openR, targetOpenR, (winkR > 0.4) ? 0.6 : 0.5, dt);
    this.wide       = approach(this.wide, tWide, 0.25, dt);
    this.squint     = approach(this.squint, tSquint, 0.2, dt);
    this.lid        = approach(this.lid, restLid, 0.08, dt);
    this.glassesSun = approach(this.glassesSun, tSun, 0.18, dt);
    this.glasses3D  = approach(this.glasses3D, t3D, 0.18, dt);
    this.glassesRead= approach(this.glassesRead, tRead, 0.12, dt);
    this.browWhite  = approach(this.browWhite, stage.whiteBrows ? 1 : 0, 0.05, dt);
    this.cane       = approach(this.cane, stage.cane ? 1 : 0, 0.06, dt);
    this.mouthOpen  = approach(this.mouthOpen, tMouth, 0.2, dt);
    this.sweat      = approach(this.sweat, tSweat, 0.12, dt);
    this.lookX      = approach(this.lookX, lookX, dartPhase != null ? 0.6 : 0.25, dt);
    this.lookY      = approach(this.lookY, lookY, 0.25, dt);
    this.babyEyes   = approach(this.babyEyes, tBaby, 0.06, dt);
    this.wrinkles   = approach(this.wrinkles, tWrinkles, 0.06, dt);
    this.darkBags   = approach(this.darkBags, tBags, 0.05, dt);
    this.hunched    = approach(this.hunched, tHunched, 0.05, dt);
    this.blush      = approach(this.blush, tBlush, 0.08, dt);
    this.pale       = approach(this.pale, tPale, 0.05, dt);
    this.tie        = approach(this.tie, tTie, 0.12, dt);
    this.headphones = approach(this.headphones, tHeadphones, 0.16, dt);
    this.propBob    = approach(this.propBob, tBob, 0.3, dt);

    return this;
  }

  resumeFromSleep() {
    this._idleMs = 0; this._blinking = 0; this._blinkTimer = this._nextBlink(1);
  }
}
