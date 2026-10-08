/*
  Google ads through the AdSense Ad Placement API (H5 Games Ads)
  https://developers.google.com/ad-placement

  - Interstitials only at natural breaks between runs, never during play.
    Google decides whether one is due (frequency hint below).
  - A rewarded ad the player can choose to watch on the results screen.

  Configuration (see .env.example):
    VITE_ADSENSE_CLIENT  publisher ID, e.g. ca-pub-1234567890123456
    VITE_ADS             on | test | off. Defaults: dev -> test, build -> on

  A production build without a publisher ID never loads anything from Google.
  If the script is blocked (ad blocker, offline) the game simply carries on.
*/

const SCRIPT_URL = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
const TEST_CLIENT = 'ca-pub-0000000000000000';
const FREQUENCY_HINT = '120s';
const START_TIMEOUT = 2500; // ms to wait for an interstitial before moving on

export class Ads {
  constructor(hooks = {}) {
    const env = import.meta.env;
    const mode = env.VITE_ADS || (env.DEV ? 'test' : 'on');
    let client = env.VITE_ADSENSE_CLIENT || '';
    if (client && !/^ca-pub-\d{10,20}$/.test(client)) {
      console.warn(`[ads] VITE_ADSENSE_CLIENT "${client}" should look like ca-pub-1234567890123456 - ads disabled`);
      client = '';
    }
    this.test = mode === 'test';
    this.client = mode === 'off' ? '' : client || (this.test ? TEST_CLIENT : '');
    this.hooks = hooks;
    this.ready = false;
    this.failed = false;
    this.showing = false;
  }

  get enabled() {
    return !!this.client;
  }

  get available() {
    return this.enabled && this.ready && !this.failed;
  }

  init() {
    if (!this.enabled) return;
    window.adsbygoogle = window.adsbygoogle || [];
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `${SCRIPT_URL}?client=${encodeURIComponent(this.client)}`;
    script.dataset.adClient = this.client;
    script.dataset.adFrequencyHint = FREQUENCY_HINT;
    if (this.test) script.dataset.adbreakTest = 'on';
    script.addEventListener('error', () => {
      this.failed = true;
    });
    document.head.appendChild(script);
    this.push({
      preloadAdBreaks: 'on',
      sound: 'on',
      onReady: () => {
        this.ready = true;
      }
    });
  }

  push(options) {
    try {
      window.adsbygoogle.push(options);
    } catch (e) {
      this.failed = true;
    }
  }

  adStarted() {
    if (this.showing) return;
    this.showing = true;
    if (this.hooks.onAdStart) this.hooks.onAdStart();
  }

  adEnded() {
    if (!this.showing) return;
    this.showing = false;
    if (this.hooks.onAdEnd) this.hooks.onAdEnd();
  }

  // Interstitial at a natural break ('start', 'next', ...). Resolves when the
  // game may continue - right away if no ad is due or none is available.
  interstitial(type, name) {
    return new Promise(resolve => {
      if (!this.available) {
        resolve('unavailable');
        return;
      }
      let started = false;
      let done = false;
      const finish = status => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.adEnded();
        resolve(status || 'done');
      };
      const timer = setTimeout(() => {
        if (!started) finish('timeout');
      }, START_TIMEOUT);
      this.push({
        type,
        name,
        beforeAd: () => {
          started = true;
          this.adStarted();
        },
        afterAd: () => this.adEnded(),
        adBreakDone: info => finish(info && info.breakStatus)
      });
    });
  }

  // Rewarded ad. onOffer(show) runs when an ad is ready: show the player the
  // offer and call show() only if they accept. onReward() runs after a full
  // view. Resolves when the ad break is over (watched, dismissed, ignored...).
  reward(name, { onOffer, onReward }) {
    return new Promise(resolve => {
      if (!this.available) {
        resolve('unavailable');
        return;
      }
      this.push({
        type: 'reward',
        name,
        beforeAd: () => this.adStarted(),
        afterAd: () => this.adEnded(),
        beforeReward: showAdFn => onOffer(showAdFn),
        adDismissed: () => {},
        adViewed: () => onReward(),
        adBreakDone: info => {
          this.adEnded();
          resolve((info && info.breakStatus) || 'done');
        }
      });
    });
  }

  // Google's consent message (AdSense > Privacy & messaging) is only present
  // for visitors who need it, e.g. in the EEA and UK.
  get hasPrivacyOptions() {
    return !!(window.googlefc && typeof window.googlefc.showRevocationMessage === 'function');
  }

  showPrivacyOptions() {
    if (this.hasPrivacyOptions) window.googlefc.showRevocationMessage();
  }
}
