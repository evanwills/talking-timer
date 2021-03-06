/* globals HTMLElement, SpeechSynthesisUtterance, speechSynthesis, AudioContext, customElements, talkingTimerExternalDefaults */

/**
 * @var {object} talkingTimerExternalDefaults (global variable)
 *
 * This is intended to provide a way of customising some of the
 * defaults for `talking-timer` without having to modify the code below
 *
 * It can be omitted or have any or all of the following properties
 * & sub-properties:
 *
 * {
 *   priority: string (default: "fraction"),
 *   pre: {
 *     10000: integer (default: 200),
 *     15000: integer (default: 600),
 *     20000: integer (default: 1200)
 *   },
 *   preSpeakStart: integer (default: 2300),
 *   preSpeakEnd: integer (default: 3300),
 *   chimeDelay: integer (default: 5000),
 *   suffixes: {
 *     first: string (default: " gone." - note the preceeding " "),
 *     last: string (default: " to go." - note the preceeding " "),
 *     half: string (default: "Half way."),
 *   },
 *   intervalTime: integer (default: 20),
 *   sayDefault: string (default: "1/2 30s last20 last15 allLast10"),
 *   endText: string (default: "Time's up!"),
 *   startText: string (default: "Ready. Set. Go!"),
 * }
 *
 * __NOTE:__ integers represent milliseconds and are used as delays
 *       between one action and another
 *
 * PS: This may or may not be the best solution to customising default
 *     configuration. I'll keep researching to see if I can find a
 *     better solution. For now this is simple and reliable.
 */

/**
 * TalkingTimer is a web component for visual and audio countdown
 * timing. (For when my kids need to stop doing a thing they don't
 * want to stop. And for when I'm teaching and running a time
 * sensitive exercise)
 *
 * references:
 *   https://developers.google.com/web/fundamentals/web-components/customelements
 *   https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements
 */
class TalkingTimer extends HTMLElement {
  constructor () {
    super()

    this.initialValue = {
      hours: 0,
      minutes: 0,
      seconds: 0
    }
    this.currentValue = {
      hours: 0,
      minutes: 0,
      seconds: 0,
      tenths: 0
    }

    this.endTime = 0

    this.initialMilliseconds = 0
    this.remainingMilliseconds = 0

    this.config = {
      autoDestruct: -1,
      autoReset: false,
      noCloseBtn: false,
      noEdit: false,
      noEndChime: false,
      noPause: false,
      noReconfigure: false,
      noReset: false,
      noRestart: false,
      noSayEnd: false,
      selfDestruct: false,
      sayStart: false,
      priority: this.getGlobal('fraction', 'priority')
    }

    /**
     * @var {array} pre defines the time before a spoken interval
     *                  when the `<talking-timer>` component should
     *                  start speaking
     *
     * This is used to account for the length of time it takes to
     * speak the interval. The intention is to have the speaking
     * finish as close to the interval time as possible.
     *
     * `remaining` - represents the time left until the current timer
     *               completes
     * `delay`     - the amount of time the text-to-speech is
     *               estimated to take
     */
    this.pre = [
      { remaining: 10000, delay: this.getGlobal(200, 'pre', 10000) },
      { remaining: 19999, delay: this.getGlobal(600, 'pre', 19999) },
      { remaining: 86400, delay: this.getGlobal(1200, 'pre', 86400) }
    ]

    /**
     * @var {integer} preSpeakStart the number of millisecond it is
     *                estimated to complete the text-to-speach intro
     *                before starting the timer.
     */
    this.preSpeakStart = this.getGlobal(2300, 'preSpeakStart')

    /**
     * @var {integer} preSpeakEnd the number of millisecond it is
     *                estimated to complete the end text-to-speach
     *                when the timer finishes.
     *
     * Used to delay the endChime so it doesn't start while end
     * text-to-speach is in progress.
     */
    this.preSpeakEnd = this.getGlobal(3300, 'preSpeakEnd')
    this.chimeDelay = this.getGlobal(5000, 'chimeDelay')

    this.suffixes = {
      first: this.getGlobal(' gone.', 'suffixes', 'first'),
      last: this.getGlobal(' to go.', 'suffixes', 'last'),
      half: this.getGlobal('Half way.', 'suffixes', 'half')
    }

    this.intervalTime = this.getGlobal(20, 'intervalTime') // milliseconds

    this.play = false

    this.closeBtn = null
    this.closeClick = null
    this.editBtn = null
    this.editClick = null
    this.playPauseBtn = null
    this.playPauseClick = null
    this.resetBtn = null
    this.resetClick = null
    this.restartBtn = null
    this.restartClick = null
    this.numbers = null
    this.progressTicker = null
    this.h1 = null
    this.sayDefault = this.getGlobal('1/2 30s last20 last15 allLast10', 'sayDefault')
    this.say = ''
    this.sayIntervals = []
    this.workingIntervals = []

    this.endText = this.getGlobal('Time\'s up!', 'endText')
    this.startText = this.getGlobal('Ready. Set. Go!', 'startText')

    this.multipliers = { hours: 3600000, minutes: 60000, seconds: 1000, tenths: 100 }

    let shadowRoot = this.attachShadow({ mode: 'open' })
    shadowRoot.appendChild(this.getDOM())
  }

  static get observedAttributes () {
    return [
      'currentValue',
      'endTime',
      'playing',
      'remainingMilliseconds'
    ]
  }

  // ======================================================
  // START: standard custom element callbacks

  connectedCallback () {
    this.parseAttributes()

    if (this.initialMilliseconds > 10000) {
      this.playPauseClick = this.getPlayPauseClick()
      this.playPauseBtn.addEventListener('click', this.playPauseClick)

      if (this.config.noReset === true) {
        this.resetBtn.classList.add('hide')
      }

      this.resetClick = this.getResetClick()
      this.resetBtn.addEventListener('click', this.resetClick)
      if (this.config.noReset === true) {
        this.resetBtn.classList.add('hide')
      }

      this.restartClick = this.getRestartClick()
      this.restartBtn.addEventListener('click', this.restartClick)

      if (this.config.noCloseBtn === false) {
        this.closeClick = this.getCloseClick()
        this.closeBtn.addEventListener('click', this.closeClick)
      } else {
        this.h1.classList.add('noclosebtn')
        this.closeBtn.remove()
      }

      this.setTimeText()
      this.resetTimerValues()

      this.inProgress = false
      this.voice = window.speechSynthesis
    }
  }

  disconnectedCallback () {
    this.playPauseBtn.removeEventListener('click', this.playPauseClick)
    this.closeBtn.removeEventListener('click', this.closeClick)
    this.resetBtn.removeEventListener('click', this.resetClick)
    this.restartBtn.removeEventListener('click', this.restartClick)
    if (this.config.noEdit === false) {
      this.editBtn.removeEventListener('click', this.editClick)
    }
  }

  //  END:  standard custom element callbacks
  // ======================================================
  // START: getters & setters

  // get time () { return this.timeObjToString(this.initialValue) }

  // set time (hoursMinutesSeconds) {
  //   this.validateTimeDuration(hoursMinutesSeconds)
  // }

  get playing () { return this.playing }

  set playing (val) {
    if (val) {
      this.setAttribute('playing', 'playing')
      if (!this.playing) {
        this.startPlaying()
      }
      this.playing = true
    } else {
      this.removeAttribute('playing')
      if (this.playing) {
        this.pausePlaying()
      }
      this.playing = false
    }
  }

  //  END:  getters & setters
  // ======================================================
  // START: click handlers

  /**
   * startPlaying() does all the stuff required to start a timer
   * running
   */
  startPlaying () {
    if (this.endTime === 0 && this.config.sayStart === true) {
      this.saySomething(this.startText)
      window.setTimeout(this.startPlayingInner, this.preSpeakStart, this)
    } else {
      this.startPlayingInner(this)
    }
  }

  /**
   * startPlayingInner() does all the heavy lifting required
   * by startPlaying()
   *
   * @param {this} obj the "this" context for the class
   *               (needed because startPlayingInner() may be called
   *               inside a setTimeout in which case, it will loose
   *               the appropriate "this" context)
   *
   * @returns {void}
   */
  startPlayingInner (obj) {
    obj.remainingMilliseconds = obj.initialMilliseconds

    if (obj.config.noPause === true) {
      obj.playPauseBtn.classList.add('hide')
      if (obj.config.noCloseBtn === false) {
        obj.closeBtn.classList.add('hide')
        obj.h1.classList.add('noclosebtn')
      }
    }

    if (obj.config.noReset === false && obj.config.noPause === false) {
      obj.resetBtn.classList.remove('hide')
    }

    if (obj.config.noRestart === false && obj.config.noPause === false) {
      obj.restartBtn.classList.remove('hide')
    }

    obj.setProgressTicker(obj.intervalTime)
    obj.playPauseBtn.classList.add('playing')
    obj.playPauseTxt.innerHTML = 'Pause '
    obj.playPauseIcon.innerHTML = '&Verbar;'
    obj.play = true
  }

  /**
   * pausePlaying() suspends the timer and updates the HTML to show
   * timer is stopped
   *
   * @returns {void}
   */
  pausePlaying () {
    this.clearTimerInterval()
    this.playPauseBtn.classList.remove('playing')
    this.playPauseTxt.innerHTML = 'Play '
    this.playPauseIcon.innerHTML = '&bigtriangledown;'
    this.play = false
  }

  /**
   * endPlaying() does all the stuff needed to show the
   * timer has ended
   *
   * removes the interval used by the timer, updates the
   * HTML and makes sounds
   *
   * @returns {void}
   */
  endPlaying () {
    let delay = 0
    if (this.config.noSayEnd === false) {
      this.saySomething(this.endText)
      delay = this.preSpeakEnd
    }
    if (this.config.noEndChime === false) {
      window.setTimeout(this.endSound, delay)
      delay = this.chimeDelay
    }

    this.numbers.classList.add('finished')
    this.playPauseBtn.classList.add('finished')

    this.clearTimerInterval()

    if (this.config.autoDestruct !== -1) {
      const timeout = (this.config.autoDestruct < delay) ? delay : this.config.autoDestruct
      window.setTimeout((obj) => { obj.remove() }, timeout, this)

      // This timer is going to self destruct.
      // Don't bother doing anything more
      return
    } else if (this.config.autoReset === true) {
      this.resetClick()
    }

    if (this.config.noPause === true) {
      this.playPauseBtn.classList.remove('hide')
      if (this.config.noCloseBtn === false) {
        this.closeBtn.classList.remove('hide')
        this.h1.classList.remove('noclosebtn')
      }
    }
  }

  /**
   * getPlayPauseClick() returns a function for handling click events
   * on the Play/Pause buttton
   *
   * When timer is running, it pause it. When timer is paused or has
   * not yet started it starts the timer running.
   *
   * @returns {function}
   */
  getPlayPauseClick () {
    const playPauseClick = (event) => {
      if (this.play) {
        // pausing
        this.pausePlaying()
      } else {
        // start playing
        this.startPlaying()
      }
    }

    return playPauseClick
  }

  /**
   * getResetClick() handles getting the timer ready
   * to start from begining
   *
   * @returns {function}
   */
  getResetClick () {
    const resetClick = () => {
      this.pausePlaying()
      this.resetTimerValues()

      this.numbers.innerHTML = this.timeObjToString(this.initialValue)
      this.progress.value = (0)
      this.playPauseTxt.innerHTML = 'Start '

      this.numbers.classList.remove('finished')
      this.playPauseBtn.classList.remove('finished')

      this.restartBtn.classList.add('hide')
      this.resetBtn.classList.add('hide')
    }

    return resetClick
  }

  /**
   * getRestartClick() returns a function to be used as a click handler
   * for the custom element's restart button.
   *
   * Click handler resets timer and starts playing.
   *
   * @returns {function}
   */
  getRestartClick () {
    const restartClick = () => {
      this.resetClick()
      this.startPlaying()
    }

    return restartClick
  }

  /**
   * getCloseClick() returns a function to be used as a click handler
   * for the custom element's close button.
   *
   * Click handler clears all window.intervals set when a timer
   * starts.
   * Removes all event listeners then removes the custom element
   * from the DOM
   *
   * @returns {function}
   */
  getCloseClick () {
    const closeClick = (event) => {
      if (this.progressTicker !== null) {
        window.clearInterval(this.progressTicker)
      }

      this.playPauseBtn.removeEventListener('click', this.playPauseClick)
      this.resetBtn.removeEventListener('click', this.resetClick)
      this.restartBtn.removeEventListener('click', this.restartClick)
      this.closeBtn.removeEventListener('click', this.closeClick)
      this.remove()
    }

    return closeClick
  }

  //  END:  click handlers
  // ======================================================
  // START: DOM builders

  /**
   * getDOM builds the shadow DOM for the custom element
   *
   * Creates the following nodes:
   * 1. wrapping div used as the shell of the element
   * 2. a style element with all the CSS for the element
   * 3. the heading containing the user supplied content for the
   *    title of the timer
   * 4. the progress bar to show where the timer is at visually
   * 5. a span containing the numbers for the textual representation
   *    of the timer's progress
   * 6. a wrapping div containing the buttons for
   *    * pause/play
   *    * restart ("Start again")
   *    * reset
   * 7. a close button to dismis the timer
   */
  getDOM () {
    const wrap = document.createElement('div')
    wrap.setAttribute('class', 'TalkingTimer-wrapper')

    const css = this.initStyle()
    const style = document.createElement('style')
    style.appendChild(css)

    const h1 = document.createElement('h1')
    const slot = document.createElement('slot')
    h1.appendChild(slot)
    wrap.appendChild(h1)
    this.h1 = h1

    const progress = document.createElement('progress')
    progress.setAttribute('max', 1)
    progress.setAttribute('value', 0)
    wrap.appendChild(progress)
    this.progress = progress

    const numbers = document.createElement('span')
    numbers.setAttribute('class', 'timer-text')
    // numbers.appendChild(document.createTextNode(startTime))
    const numbersWrap = document.createElement('div')
    numbersWrap.setAttribute('class', 'timer-text--wrap')
    numbersWrap.appendChild(numbers)
    wrap.appendChild(numbersWrap)

    this.numbers = numbers

    wrap.appendChild(this.initMainBtns())
    wrap.appendChild(this.initCloseBtn())
    wrap.appendChild(style)

    return wrap
  }

  /**
   * initCloseBtn() builds a close button to be inserted into the
   * HTML of the custom element
   *
   * @returns {HTMLElement} simple close button
   */
  initCloseBtn () {
    const close = document.createElement('button')
    const closeSR = document.createElement('span')
    const closeIcon = document.createElement('span')

    closeSR.setAttribute('class', 'sr-only')
    closeSR.appendChild(document.createTextNode('Close'))

    closeIcon.setAttribute('class', 'smallBtn__icon')
    closeIcon.innerHTML = '&CircleTimes;'

    close.setAttribute('class', 'closeBtn smallBtn')
    close.appendChild(closeSR)
    close.appendChild(closeIcon)

    this.closeBtn = close

    return close
  }

  /**
   * initMainBtns() builds three buttons and wraps them in a <div>
   *
   * Buttons are:
   *   * pausePlay - used to control the countdown timing process
   *   * restart - used to trigger a reset, play action
   *   * reset - used to trigger a stop, reset action
   *
   * @returns {HTMLElement}
   */
  initMainBtns () {
    const btnWrap = document.createElement('div')
    btnWrap.setAttribute('class', 'btn-wrapper')

    const playPauseIcon = document.createElement('span')
    playPauseIcon.innerHTML = '&bigtriangledown;'
    playPauseIcon.setAttribute('class', 'non-sr icon')

    const playPauseTxt = document.createElement('span')
    playPauseTxt.setAttribute('class', 'playPauseTxt')
    playPauseTxt.appendChild(document.createTextNode('Start '))

    const playPause = document.createElement('button')
    playPause.setAttribute('class', 'playPauseBtn')
    playPause.appendChild(playPauseTxt)
    playPause.appendChild(playPauseIcon)

    const restartIcon = document.createElement('span')
    restartIcon.setAttribute('class', 'non-sr icon')
    restartIcon.innerHTML = '&circlearrowright;'

    const restart = document.createElement('button')
    restart.setAttribute('class', 'restartBtn')
    restart.appendChild(document.createTextNode('Start again '))
    restart.appendChild(restartIcon)
    restart.classList.add('hide')

    const resetIcon = document.createElement('span')
    resetIcon.setAttribute('class', 'non-sr icon')
    resetIcon.innerHTML = '&hookleftarrow;'

    const reset = document.createElement('button')
    reset.setAttribute('class', 'resetBtn')
    reset.appendChild(document.createTextNode('Reset '))
    reset.appendChild(resetIcon)
    reset.classList.add('hide')

    btnWrap.appendChild(playPause)
    btnWrap.appendChild(restart)
    btnWrap.appendChild(reset)

    this.playPauseBtn = playPause
    this.playPauseIcon = playPauseIcon
    this.playPauseTxt = playPauseTxt
    this.restartBtn = restart
    this.resetBtn = reset

    return btnWrap
  }

  /**
   * initStyle() returns block of CSS for styling the <talking-timer>
   * element's shadow DOM
   *
   * @returns {textNode} CSS string
   */
  initStyle () {
    return document.createTextNode(`
      :host {
        --closebtn-left: 2;
        --closebtn-right: 3;
        --closebtn-top: 1;
        --closebtn-bottom: 2;

        --configbtn-left: -2;
        --configbtn-right: -1;
        --configbtn-top: 3;
        --configbtn-bottom: 4;

        --btn-color: inherit;
        --btn-background: #fff;
        --btn-size: 1.25em;
        --btn-padding: 0.5em 0;
        --btn-border-color: #c0e;
        --btn-border-width: 0.05em;
        --btn-hover-color: #fff;
        --btn-hover-background: #eee;
        --btn-hover-border-color: #eee;
        --btn-hover-border-width: 0.05em;

        --h1-size: 1.5em;
        --h1-padding: 0.5em 2.5em 0.5em 0.5em;
        --h1-noclosebtn-padding: 0.5em;
        --h1-align: center;

        --playpause-color: #fff;
        --playpause-size: 1.25em;
        --playpause-weight: bold;
        --playpause-background: #050;
        --playpause-border-width: 0.05em;
        --playpause-border-color: #040;
        --playpause-hover-weight: bold;
        --playpause-hover-color: #fff;
        --playpause-hover-background: #030;
        --playpause-hover-border-width: #fff;
        --playpause-hover-border-color: #020;

        --progress-background: #fff;
        --progress-border-color: #ccc;
        --progress-border-width: 0.05em;
        --progress-color: #F00;
        --progress-height: 2em;
        --progress-left: -0.05em;
        --progress-right: auto;

        --smallbtn-color: inherit;
        --smallbtn-background: transparent;
        --smallbtn-border-width: 0;
        --smallbtn-border-style: none;
        --smallbtn-border-color: transparent;
        --smallbtn-size: 2em;
        --smallbtn-left: 2;
        --smallbtn-right: 2;
        --smallbtn-position: absolute;
        --smallbtn-padding: 0.2em 0.25em;
        --smallbtn-weight: normal;
        --smallbtn-hover-color: #c00;
        --smallbtn-hover-weight: bold;
        --smallbtn-hover-background: transparent;
        --smallbtn-hover-border-width: 0;
        --smallbtn-hover-border-style: none;
        --smallbtn-hover-border-color: transparent;

        --talkingTimer-columns: auto 2em;
        --talkingTimer-rows: 2em auto auto 2em auto auto;

        --timertext-color: #222;
        --timertext-family: verdana, arial, helvetica, sans-serif;
        --timertext-size: 6em;
        --timertext-weight: bold;
        --timertext-padding: 0.1em 0.25em 0.2em;
        --timertext-align: center;

        --wrapper-border-width: 0.05em;
        --wrapper-border-color: #ccc;
      }

      :root {
        font-family: inherit;
        color: inherit;
      }

      h1 {
        grid-column-start: 1;
        grid-column-end: 3;
        grid-row-start: 1;
        grid-row-end: 3;
        font-size: var(--h1-size);
        margin: 0;
        padding: var(--h1-padding);
        text-align: var(--h1-align);
      }

      h1.noclosebtn {
        padding: var(--h1-noclosebtn-padding);
      }

      .btn-wrapper {
        grid-column-start: 1;
        grid-column-end: 3;
        grid-row-start: 6;
        grid-row-end: 7;
        align-items: stretch;
        display: flex;
        justify-content: space-between;
      }

      button {
        background-color: var(--btn-background);
        border-width: var(--btn-border-width);
        border-style:  solid;
        border-color: var(--btn-border-color);
        flex-grow: 1;
        font-size: var(--btn-size);
        font-variant: small-caps;
        padding: var(--btn-padding);
      }

      button:last-child {
        border-right-width: 0.075em;
      }

      button:hover {
        background-color: var(--btn-hover-background);
        border-width: var(--btn-hover-border-width);
        border-color: var(--btn-hover-border-color);
        cursor: pointer;
      }

      button .icon {
        display: inline-block;
        font-weight: bold;
        font-size: 1.25em;
        margin-bottom: -1em;
        margin-left: 0.3em;
        margin-top: -1em;
        transform: translateY(0.15em);
      }

      .playPauseBtn {
        border-color: var(--playpause-border-color);
        border-width: var(--playpause-border-width);
        background-color: var(--playpause-background);
        color: var(--playpause-color);
        flex-grow: 3;
        font-weight: var(--playpause-weight);
      }

      .playPauseBtn:hover {
        background-color: var(--playpause-hover-background);
        border-color: var(--playpause-hover-border-color);
        font-weight: var(--playpause-hover-weight);
      }

      .playPauseBtn .icon {
        transform: translateY(0.15em) rotate(30deg);
      }

      .playPauseBtn.playing .icon {
        transform: translateY(-0.05em);
      }

      .playPauseBtn.finished {
        opacity: 0;
      }

      .restartBtn .icon {
        font-size: 1.5em;
        transform: translateY(0.15em) rotate(45deg);
      }

      .resetBtn .icon {
        font-weight: normal;
      }

      @media screen {
        .sr-only {
          display: inline-block;
          height: 1px;
          margin: -1px 0 0 -1px;
          opacity: 0;
          width: 1px;
        }
      }

      .smallBtn {
        background: var(--smallbtn-background);
        border-width: var(--smallbtn-border-width);
        border-style: var(--smallbtn-border-style);
        border-color: var(--smallbtn-border-color);
        color: var(--smallbtn-color);
        font-size: var(--smallbtn-size);
        font-weight: var(--smallbtn-weight);
        grid-column-start: var(--smallbtn-left);
        grid-column-end: var(--smallbtn-right);
        line-height: 0em;
        margin: 0;
        padding: var(--smallbtn-padding);
      }

      .closeBtn {
        grid-row-start: var(--closebtn-top);
        grid-row-end: var(--closebtn-bottom);
      }

      .smallBtn:hover,
      .smallBtn:focus {
        background-color: var(--smallbtn-hover-background);
        border-width: var(--smallbtn-hover-border-width);
        border-style: var(--smallbtn-hover-border-style);
        border-color: var(--smallbtn-hover-border-color);
        color: var(--smallbtn-hover-color);
        font-weight: var(--smallbtn-hover-weight);
      }

      .smallBtn__icon {
        position: relative;
        top: 0;
        left: -0.25em;
      }

      .timer-text {
        color: var(--timertext-color);
        display: block;
        font-family: var(--timertext-family);
        font-size: var(--timertext-size);
        font-weight: var(--timertext-weight);
        padding: var(--timertext-padding);
        text-align: var(--timertext-align);
      }

      progress {
        grid-column-start: 1;
        grid-column-end: 3;
        grid-row-start: 3;
        grid-row-end: 4;
        z-index: 10;
        background-color: #fff;
        border-width: var(--progress-border-width);
        border-style: solid;
        border-color: var(--progress-border-color);
        color: var(--progress-color);
        display: block;
        height: var(--progress-height);
        left: var(--progress-left);
        right: var(--progress-right);
        position: relative;
        width: 100%;
      }

      .finished {
        background-color: #c00;
        color: #fff;
      }

      .tenths {
        font-size: 0.5em;
        font-weight: normal;
      }

      .hide {
        display: none;
      }

      .TalkingTimer-wrapper {
        display: grid;
        grid-template-columns: var(--talkingTimer-columns);
        grid-template-rows: var(--talkingTimer-rows);
      }

      .timer-text--wrap {
        grid-column-start: 1;
        grid-column-end: 3;
        grid-row-start: 4;
        grid-row-end: 6;
      }
      .config-btn {
        grid-row-start: var(-configbtn-top);
        grid-row-end: var(--configbtn-bottom);
      }
      .config-wrap {
        grid-column-start: 1;
        grid-column-end: 3;
        grid-row-start: 1;
        grid-row-end: 6;
        z-index: 10;
        overflow-y: auto;
        background-color: rgba(255, 255, 255, 0.75);
      }
      `
    )
  }

  //  END:  DOM builders
  // ======================================================
  // START: timer callbacks

  /**
   * setTimeText() returns a callback function to be passed to
   * `window.setInterval()` or `window.clearInterval()`
   *
   * The callback handles updating the textual representation of the
   * time remaining in the countdown
   *
   * @returns {void}
   */
  setTimeText () {
    this.numbers.innerHTML = this.timeObjToString(this.currentValue)
  }

  /**
   * setProgressTicker()
   *
   * @param {integer} interval number of Milliseconds the interval
   *                 should be between when the progress bar is
   *                 updated.
   * @returns {void}
   */
  setProgressTicker (interval) {
    if (this.endTime === 0) {
      this.endTime = Date.now() + this.remainingMilliseconds
    }

    const progressTickTock = () => {
      this.remainingMilliseconds = this.endTime - Date.now()

      if (this.remainingMilliseconds < 0) {
        this.remainingMilliseconds = 0
      }

      const promise1 = new Promise((resolve, reject) => {
        const preOffset = this.getSpeakPreOffset(this.remainingMilliseconds)
        this.progress.value = (1 - (this.remainingMilliseconds / this.initialMilliseconds))
        this.currentValue = this.millisecondsToTimeObj(this.remainingMilliseconds)

        if (Math.floor(this.remainingMilliseconds) <= 0) {
          this.endPlaying()
        } else if (this.workingIntervals.length > 0 && (this.workingIntervals[0].offset + preOffset) > this.remainingMilliseconds) {
          const sayThis = this.workingIntervals.shift()
          if (this.posMinus(sayThis.offset, this.remainingMilliseconds) < 2000) {
            // This ensures that if for some reason, there is a
            // back-log of intervals to be spoken, only intervals
            // that should have been spoken within the last
            // 2 seconds get spoken
            this.saySomething(sayThis.message)
          }
        }
      })
      const promise3 = new Promise((resolve, reject) => { this.setTimeText() })
    }
    this.progressTicker = setInterval(progressTickTock, interval)
  }

  /**
   * getSpeakPreOffset() gets the number of milliseconds the text-to-speech should take
   *
   * @param {integer} timeRemaining number of Milliseconds
   *                 remaining until the end of the timer
   *.
   * @returns {integer}
   */
  getSpeakPreOffset (timeRemaining) {
    const c = this.pre.length
    for (let a = 0; a < c; a += 1) {
      if (timeRemaining <= this.pre[a].remaining) {
        return this.pre[a].delay
      }
    }
    const b = c - 1
    return this.pre[b].delay
  }

  //  END:  timer callbacks
  // ======================================================
  // START: utility methods

  /**
   * onlyGreaterThanZero() ensures that the most significant field in
   * the returned timeObj is non-zero
   *
   * @param {object} currentValue containing seconds, minutes & hours
   *                representing the timer's duration
   *
   * @returns {object} object containing only the least significant
   *                fields greater than zero
   */
  onlyGreaterThanZero (currentValue) {
    const fields = ['hours', 'minutes', 'seconds', 'tenths']
    let tmpValue = {}
    let allTheRest = false

    for (let a = 0; a < 4; a += 1) {
      const field = fields[a]
      const isNum = typeof currentValue[field] === 'number'
      if (allTheRest === true || (isNum === true && currentValue[field] > 0)) {
        tmpValue[field] = (isNum === true) ? currentValue[field] : 0
        allTheRest = true
      }
    }

    return tmpValue
  }

  /**
   * validateTimeDuration() validates the value of the element's `start`
   * attribute
   *
   * __NOTE:__ the parsed value of `start` must be less than 24 hours
   *
   * __NOTE ALSO:__ this method also assignes parsed values to object
   *       properties
   *
   * @param {string} hoursMinutesSeconds the string value of the
   *                 element's `start` attribute
   *
   * @returns {boolean} TRUE if hoursMinutesSeconds can be parsed.
   *          FALSE otherwise
   */
  validateTimeDuration (hoursMinutesSeconds) {
    const regex = new RegExp('^(?:(?:(?:([0-1]?[0-9]|2[0-4]):)?([0-5]?[0-9]):)?([0-5]?[0-9])|([6-9][0-9]|[1-9][0-9]{2,5}))$')

    if (typeof hoursMinutesSeconds === 'string') {
      let tmpStart = { hours: 0, minutes: 0, seconds: 0 }
      const matches = regex.exec(hoursMinutesSeconds)

      if (matches !== null) {
        const len = matches.length

        if (len === 5 && typeof matches[4] !== 'undefined') {
          let seconds = Number.parseInt(matches[4], 10)

          if (seconds > 86400) {
            // limit the maximum duration of the timer to 24 hours
            seconds = 86400
          }

          this.initialMilliseconds = seconds * 1000
          this.initialValue = this.millisecondsToTimeObj(this.milliseconds)
        } else if (len > 0) {
          tmpStart.seconds = Number.parseInt(matches[3], 10)
          tmpStart.minutes = (typeof matches[2] === 'string' && matches[2] !== '') ? Number.parseInt(matches[2], 10) : 0
          tmpStart.hours = (typeof matches[1] === 'string' && matches[1] !== '') ? Number.parseInt(matches[1], 10) : 0

          this.initialValue = tmpStart
          this.initialMilliseconds = this.timeObjToMilliseconds(tmpStart)
        }
      } else {
        console.error('talking-timer must have a start value matching the following one of the following patterns: "SS", "MM:SS" or "HH:MM:SS". "' + hoursMinutesSeconds + '" does not match any of these patterns.')
        return false
      }
      this.resetTimerValues()
      return true
    } else {
      console.error('talking-timer must have a start value matching the following one of the following patterns: "SS", "MM:SS" or "HH:MM:SS". Empty string provided.')
      return false
    }
  }

  /**
   * timeObjToString() converts the current time remaining for
   * the countdown into a human readable string
   *
   * @param {object} timeObj seconds, minutes and hours value
   *                representing the timer remaining for the timer.
   * @param {boolean} nonZeroOnly [default: TRUE] whether or not to
   *                remove most significant fields if they're zero
   *
   * @returns {string} has the following structure "SS", "MM:SS",
   *                "HH:MM:SS" or "HH:MM:SS:CC" ("CC" = hundredths of
   *                a second) depending on the value of the `timeObj`
   *                attribute
   */
  timeObjToString (timeObj, nonZeroOnly) {
    const tmpTimeObj = (typeof nonZeroOnly !== 'boolean' || nonZeroOnly === true) ? this.onlyGreaterThanZero(timeObj) : { ...timeObj }
    const fields = Object.keys(tmpTimeObj)
    const wholeTimeFields = fields.filter(field => field !== 'tenths')
    const tenthsField = fields.filter(field => field === 'tenths')

    let output = ''
    for (let a = 0; a < wholeTimeFields.length; a += 1) {
      const field = wholeTimeFields[a]
      const zero = (tmpTimeObj[field] < 10 && output !== '') ? '0' : ''
      const colon = (output === '') ? '' : ':'
      output += colon + zero + Math.round(tmpTimeObj[field])
    }

    if (tenthsField.length > 0) {
      const colon = (output === '') ? '0.' : '.'
      output += colon + '<span class="tenths">' + Math.round(tmpTimeObj.tenths) + '</span>'
    } else if (output === '') {
      output = '0'
    }

    return output
  }

  /**
   * timeObjToMilliseconds() converts the values of a time object to
   * milliseconds
   *
   * @param {object} timeObj
   *
   * @returns {number} number of milliseconds the time object represents
   */
  timeObjToMilliseconds (timeObj) {
    const fields = ['tenths', 'seconds', 'minutes', 'hours']

    const tmpTimeObj = (typeof timeObj.tenths === 'undefined') ? { ...timeObj, 'tenths': 0 } : { ...timeObj }

    let output = 0
    for (let a = 0; a < 4; a += 1) {
      const field = fields[a]
      output += tmpTimeObj[field] * this.multipliers[field]
    }

    return output
  }

  /**
   * millisecondsToTimeObj() converts the number of milliseconds
   * provided to a timeObj object
   * @param {number} milliseconds
   * @returns {object} time object with the form {hours, minutes, seconds, tenths}
   */
  millisecondsToTimeObj (milliseconds) {
    const fields = ['hours', 'minutes', 'seconds', 'tenths']

    let output = {
      hours: 0,
      minutes: 0,
      seconds: 0,
      tenths: 0
    }
    let remainder = milliseconds

    for (var a = 0; a < 4; a += 1) {
      const field = fields[a]
      const tmp = this.getWholePart(remainder, this.multipliers[field])
      remainder = tmp.part
      output[field] = tmp.whole
    }

    return output
  }

  /**
   * getWholePart() (PURE) converts the number of milliseconds
   * provided into the whole number of units
   *
   * @param {number} input the number of millseconds to be converted
   *                 into approprate time unit
   *                 (e.g. hours, minutes, seconds, tenths of a second)
   * @param {number} multiplier the value used to multiply (or divide
   *                 in this case) the number of milliseconds to get
   *                 the unit value
   * @returns {object} two part object containing the "whole" value for
   *                 the unit and the remaining number of milliseconds
   *                 to be passed to the next unit
   */
  getWholePart (input, multiplier) {
    const wholeVal = Math.floor(input / multiplier)
    const partVal = input - (wholeVal * multiplier)
    return {
      whole: wholeVal,
      part: partVal
    }
  }

  /**
   * resetTimerValues() resets all the timer values to their original
   * state then clears the interval timers
   *
   * @returns {void}
   */
  resetTimerValues () {
    this.currentValue = { ...this.initialValue }
    this.remainingMilliseconds = this.initialMilliseconds
    this.endTime = 0
    this.clearTimerInterval()

    // Clone sayIntervals so you have something to use next time
    this.workingIntervals = this.sayIntervals.map(interval => { return { ...interval } })
  }

  /**
   * clearTimerInterval() clears interval timers and resets the
   * timer IDs to null
   *
   * @returns {void}
   */
  clearTimerInterval () {
    window.clearInterval(this.progressTicker)

    this.progressTicker = null
  }

  /**
   * parseAttributes() parses the know HTML attributes available to
   * <talking-timer>
   *
   * @returns {void}
   */
  parseAttributes () {
    if (this.hasAttribute('time') && this.validateTimeDuration(this.getAttribute('time'))) {
      this.numbers.innerHTML = this.timeObjToString(this.onlyGreaterThanZero(this.initialValue))
    } else {
      // No timer... nothing to do.
      console.error('talking-timer custom element requires a time attribute which representing the total number of seconds or time string (HH:MM:SS)')
      return false
    }

    const configKeys = Object.keys(this.config)
    for (let a = 0; a < configKeys.length; a += 1) {
      const key = configKeys[a]
      const attr = key.toLocaleLowerCase()
      const val = this.getAttribute(attr)
      this.config[key] = (typeof val !== 'undefined' && val !== null)
    }

    const endText = this.getAttribute('end-message')
    if (typeof endText !== 'undefined' && endText !== null) {
      this.config.noSayEnd = false
      this.endText = endText
    }

    const startText = this.getAttribute('start-message')
    if (typeof startText === 'string' && startText !== null && startText !== '') {
      this.config.nosayStart = false
      this.startText = startText
    }

    const priority = this.getAttribute('priority')
    this.config.priority = (typeof priority !== 'undefined' || priority !== 'time') ? 'fraction' : 'time'

    let say = this.getAttribute('say')
    say = (typeof say !== 'string') ? this.sayDefault : say
    this.say = say
    this.sayIntervals = this.parseRawIntervals(say, this.initialMilliseconds)

    let selfDestructOverride = false

    const autoDestruct = this.getAttribute('selfdestruct')
    if (typeof autoDestruct === 'string') {
      const isNum = new RegExp('^[1-9][0-9]*$')
      if (isNum.test(autoDestruct)) {
        const intAutoDestruct = Number.parseInt(autoDestruct, 10)
        this.config.autoDestruct = (intAutoDestruct > 43200) ? 43200 : intAutoDestruct
        this.config.autoDestruct *= 1000
        selfDestructOverride = true
      } else {
        this.config.autoDestruct = 10000
      }
    } else {
      this.config.autoDestruct = -1
    }

    if (this.config.noCloseBtn === true) {
      if (selfDestructOverride === true) {
        // If a number value for `selfdestruct` is set then it overrides
        // `noclose`
        this.config.noCloseBtn = false
      } else {
        // If `selfdestruct` is just boolean, then `noclose` overrides
        // `selfdestruct`
        this.config.autoDestruct = -1
      }
    }
  }

  /**
   * getGlobal() checks to see if `talkingTimerExternalDefaults`
   * object exists then checks to see if it has the `prop` property
   * and (if defined) the `subProp` exists on the `prop`. If the type
   * of the prop/subProp matches the default value supplied, then it
   * is returned. Otherwise the supplied default is returned.
   *
   * @param {any} defaultValue value to be used as default
   * @param {string} prop property of `talkingTimerExternalDefaults`
   *                 to be tested.
   * @param {string} subProp property of `talkingTimerExternalDefaults[prop]`
   *                 to be tested.
   *
   * @returns {any} a value with the same type as `defaultValue`
   */
  getGlobal (defaultValue, prop, subProp) {
    if (typeof talkingTimerExternalDefaults !== 'undefined' && typeof prop !== 'undefined') {
      const propType = typeof talkingTimerExternalDefaults[prop]
      const defaultType = typeof defaultValue
      if (propType !== 'undefined') {
        if (typeof subProp !== 'undefined') {
          const subPropType = typeof talkingTimerExternalDefaults[prop][subProp]
          return (subPropType !== 'undefined' && defaultType === subPropType) ? talkingTimerExternalDefaults[prop][subProp] : defaultValue
        } else if (propType === defaultType) {
          return talkingTimerExternalDefaults[prop]
        }
      }
    }
    return defaultValue
  }

  //  END:  utility methods
  // ======================================================
  // START: raw interval parser

  /**
   * this.parseRawIntervals() builds an array of objects which in turn can
   * be used to build promises that trigger speach events.
   *
   * @param {string} rawIntervals
   * @param {number} durationMilli
   * @param {boolean} omit
   *
   * @returns {array}
   */
  parseRawIntervals (rawIntervals, durationMilli, omit) {
    const regex = new RegExp('(?:^|\\s+)(all|every)?[_-]?([0-9]+)?[_-]?((?:la|fir)st)?[_-]?(?:([1-9][0-9]*)[_-]?([smh]?)|([1-9])?[_-]?1\\/([2-9]|10))(?=\\s+|$)', 'ig')
    let matches
    let timeIntervals = []
    let fractionIntervals = []
    let orderIntervals = []

    if (typeof rawIntervals !== 'string' || rawIntervals === '') {
      return []
    }
    const exclude = (typeof omit === 'boolean') ? omit : false

    while ((matches = regex.exec(rawIntervals)) !== null) {
      const allEvery = (typeof matches[1] !== 'undefined') ? matches[1].toLocaleLowerCase() : ''
      const firstLast = (typeof matches[3] !== 'undefined') ? matches[3].toLocaleLowerCase() : ''

      let interval = {
        all: (allEvery === 'all' || firstLast === ''),
        every: (allEvery === 'every' && firstLast !== ''),
        multiplier: (typeof matches[2] !== 'undefined' && typeof (matches[2] * 1) === 'number') ? Number.parseInt(matches[2], 10) : 1,
        relative: firstLast,
        exclude: exclude,
        isFraction: false,
        raw: matches[0]
      }

      if (interval.every === true) {
        interval.all = false
        interval.multiplier = 0
      } else if (interval.all === true) {
        interval.multiplier = 0
      }

      if (typeof matches[7] !== 'undefined') {
        // item is a fraction
        const denominator = Number.parseInt(matches[7], 10)

        interval.isFraction = true
        interval.denominator = denominator

        if (interval.multiplier > (denominator - 1)) {
          interval.multiplier = (denominator - 1)
        }

        const tmpIntervals = this.getFractionOffsetAndMessage(interval, durationMilli, interval.raw)

        if (this.config.priority === 'order') {
          orderIntervals = orderIntervals.concat(tmpIntervals)
        } else {
          fractionIntervals = fractionIntervals.concat(tmpIntervals)
        }
      } else {
        // item is a number
        matches[4] = Number.parseInt(matches[4], 10)
        interval.unit = (typeof matches[5] === 'string') ? matches[5].toLocaleLowerCase() : 's'
        interval.time = matches[4]

        const tmpIntervals = this.getTimeOffsetAndMessage(interval, durationMilli, interval.raw)
        if (this.config.priority === 'order') {
          orderIntervals = orderIntervals.concat(tmpIntervals)
        } else {
          timeIntervals = timeIntervals.concat(tmpIntervals)
        }
      }
    }

    const output = (this.config.priority === 'order') ? orderIntervals : (this.config.priority === 'time') ? timeIntervals.concat(fractionIntervals) : fractionIntervals.concat(timeIntervals)
    return this.sortOffsets(this.filterOffsets(output, durationMilli))
  }

  /**
   * this.getFractionOffsetAndMessage() returns a list of time offset
   * objects based on fractions of total duration of time.
   *
   * Used for announcing progress in timer
   *
   * @param {object} intervalObj interval object parsed from speak
   *                 attribute
   * @param {number} milliseconds number of milliseconds remaining
   *                 for timer
   *
   * @returns {array} list of interval objects containing offset &
   *                 message properties used for announcing intervals
   */
  getFractionOffsetAndMessage (intervalObj, milliseconds) {
    let interval = 0
    const half = milliseconds / 2

    interval = milliseconds / intervalObj.denominator
    if (intervalObj.denominator === 2) {
      return [{ message: 'Half way', offset: half, raw: intervalObj.raw }]
    }

    let offsets = []

    const count = (intervalObj.multiplier === 0 || intervalObj.multiplier >= intervalObj.denominator) ? intervalObj.denominator : intervalObj.multiplier

    if (intervalObj.relative !== '') {
      const suffix = (intervalObj.relative === 'first') ? this.suffixes.first : this.suffixes.last
      const minus = (intervalObj.relative === 'first') ? milliseconds : 0

      for (let a = 1; a <= count; a += 1) {
        offsets.push({
          offset: this.posMinus(minus, (interval * a)),
          message: this.makeFractionMessage(a, intervalObj.denominator) + suffix,
          raw: intervalObj.raw
        })
      }
    } else {
      for (let a = 1; a <= (count / 2); a += 1) {
        const message = this.makeFractionMessage(a, intervalObj.denominator)
        offsets.push({
          offset: (milliseconds - (interval * a)),
          message: message + this.suffixes.last
          // raw: intervalObj.raw
        },
        {
          offset: (interval * a),
          message: message + this.suffixes.first
          // raw: intervalObj.raw
        })
      }
    }

    const filtered = offsets.map(item => {
      if (this.tooClose(item.offset, half)) {
        return {
          offset: half,
          message: this.suffixes.half
          // raw: item.raw
        }
      } else {
        return item
      }
    })

    return filtered
  }

  /**
   * this.getTimeOffsetAndMessage() returns a list of time offset
   * objects for the given time interval.
   *
   * Used for announcing progress in timer
   *
   * @param {object} intervalObj interval object parsed from speak
   *                 attribute
   * @param {number} milliseconds number of milliseconds remaining
   *                 for timer
   *
   * @returns {array} list of interval objects containing offset &
   *                 message properties used for announcing intervals
   */
  getTimeOffsetAndMessage (intervalObj, milliseconds, raw) {
    const suffix = (intervalObj.relative === 'first') ? this.suffixes.first : this.suffixes.last
    let offsets = []

    if ((intervalObj.all === true || intervalObj.every === true) || intervalObj.multiplier > 1) {
      if ((intervalObj.all === true || intervalObj.every === true) && intervalObj.multiplier <= 1) {
        if (intervalObj.relative === '') {
          // not relative so announce time relative to nearest edge
          // of time (e.g. 1 minute to go & 1 minute gone)
          const half = milliseconds / 2
          const interval = intervalObj.time * 1000
          for (let offset = interval; offset <= half; offset += interval) {
            offsets.push({
              offset: offset,
              message: this.makeTimeMessage(offset, this.suffixes.last),
              raw: intervalObj.raw
            }, {
              offset: milliseconds - offset,
              message: this.makeTimeMessage(offset, this.suffixes.first),
              raw: intervalObj.raw
            })
          }
        } else {
          // interval relative === false
          // i.e. relative = "first" or "last"
          let interval = 0
          let count = 0
          switch (intervalObj.unit) {
            case 'm':
              interval = 60000
              break
            case 'h':
              interval = 3600000
              break
            case 's':
            default:
              interval = 1000
          }

          if (intervalObj.every === true) {
            interval *= intervalObj.time
            count = milliseconds / interval
          } else {
            count = intervalObj.time
          }
          const modifier = (intervalObj.relative !== 'first') ? 0 : milliseconds
          const forceSufix = (intervalObj.relative === 'first')
          for (let a = count; a > 0; a -= 1) {
            const offset = a * interval
            offsets.push({
              offset: this.posMinus(modifier, offset),
              message: this.makeTimeMessage(offset, suffix, forceSufix),
              raw: intervalObj.raw
            })
          }
        }
      } else if (intervalObj.multiplier > 1) {
        const unit = (intervalObj.unit === 's') ? 10000 : (intervalObj.unit === 'm') ? 60000 : 3600000
        const interval = intervalObj.time * unit
        const modifier = (intervalObj.relative === 'last') ? 0 : milliseconds

        for (let offset = interval; offset <= intervalObj.time; offset += interval) {
          offsets.push({
            offset: this.posMinus(modifier, offset),
            message: this.makeTimeMessage(offset, suffix),
            raw: intervalObj.raw
          })
        }
      }
    } else {
      const interval = intervalObj.time * 1000
      const offset = (intervalObj.relative !== 'first') ? interval : milliseconds - interval
      offsets = [{
        offset: offset,
        message: this.makeTimeMessage(interval, suffix),
        raw: raw
      }]
    }
    return offsets
  }

  /**
   * this.tooClose() checks whether the current value is within 5 seconds
   * of the previous value
   *
   * @param {number} current value to be tested
   * @param {number} previous value to be tested against
   *
   * @returns {boolean} TRUE if within 5 seconds of previous value
   */
  tooClose (current, previous) {
    return (current > (previous - 5000) && current < (previous + 5000))
  }

  /**
   * this.tooCloseAny() checks a given offset value against previously seen
   * offsets
   *
   * @param {number} offset
   * @param {array} previous list of previously seen numbers
   *
   * @returns {boolean} TRUE if offset was too close to a previously
   *                seen offset value. FALSE otherwise
   */
  tooCloseAny (offset, previous) {
    for (let a = 0; a < previous.length; a += 1) {
      if (this.tooClose(offset, previous[a]) === true) {
        return true
      }
    }
    return false
  }

  /**
   * this.posMinus() ensures that the value of a subtraction is always
   * positive (or zero)
   *
   * @param {number} a
   * @param {number} b
   *
   * @return {number} positive value of a - b
   */
  posMinus (a, b) {
    if (a > b) {
      return a - b
    } else {
      return b - a
    }
  }

  /**
   * this.makeTimeMessage() returns a string that can be passed to the text
   * to web speech API
   *
   * @param {number} offset milliseconds
   *
   * @returns {string} textual representation of offset
   */
  makeTimeMessage (offset, suffix, forceSufix) {
    let output = ''
    let working = offset
    let comma = ''

    forceSufix = (typeof forceSufix !== 'boolean') ? false : forceSufix

    if (working < 20000) {
      // Do not append unit if 10 seconds or less
      const tmpSuffix = (forceSufix) ? ' seconds' + suffix : (working > 10000) ? ' seconds' : ''
      return Math.round(working / 1000) + tmpSuffix
    }

    if (working >= 3600000) {
      const hours = Math.floor(working / 3600000)
      working -= hours * 3600000
      output += comma + hours.toString() + ' hour'
      output += (hours > 1) ? 's' : ''
      comma = ', '
    }

    if (working >= 60000) {
      const minutes = Math.floor(working / 60000)
      working -= minutes * 60000
      output = comma + minutes.toString() + ' minute'
      output += (minutes > 1) ? 's' : ''
      comma = ', '
    }

    working = Math.round(working / 1000)
    if (working > 0) {
      output += comma + working.toString() + ' second'
      output += (working > 1) ? 's' : ''
      comma = ', '
    }

    return output + suffix
  }

  /**
   * this.makeFractionMessage() returns a string that can be passed to the
   * text to web speech API
   *
   * @param {number} numerator for fraction
   * @param {number} denominator for fraction
   *
   * @returns {string} textual representation of the fraction offset
   */
  makeFractionMessage (numerator, denominator) {
    let fraction = ''

    // reduce the denominator to its
    const newDenominator = (Number.isInteger(denominator / numerator)) ? (denominator / numerator) : denominator
    switch (newDenominator) {
      case 2: return this.suffixes.half
      case 3: fraction = 'third'; break
      case 4: fraction = 'quarter'; break
      case 5: fraction = 'fifth'; break
      case 6: fraction = 'sixth'; break
      case 7: fraction = 'seventh'; break
      case 8: fraction = 'eighth'; break
      case 9: fraction = 'ninth'; break
      case 10: fraction = 'tenth'; break
    }

    const newNumerator = (numerator / (denominator / newDenominator))
    const s = (newNumerator > 1) ? 's' : ''

    return newNumerator + ' ' + fraction + s
  }

  /**
   * this.sortOffsets() sorts a list of offset objects by their offset value
   *
   * @param {array} input list of offset objects to be sorted
   *
   * @returns {array} items are sorted by offset
   */
  sortOffsets (input) {
    return input.sort((a, b) => {
      if (a.offset < b.offset) {
        return 1
      } else if (a.offset > b.offset) {
        return -1
      } else {
        return 0
      }
    })
  }

  /**
   * this.filterOffsets() removes duplicates an items that are too close
   * to preceeding items
   *
   * @param {array} offsets list of offset objects
   *
   * @returns {array} list of offset objects excluding duplicates and
   *                closely occuring items
   */
  filterOffsets (offsets, max) {
    let found = []
    return offsets.filter(item => {
      if (found.indexOf(item.offset) === -1 && (item.offset <= 30000 || !this.tooCloseAny(item.offset, found)) && item.offset < max && item.offset > 0) {
        found.push(item.offset)
        return true
      } else {
        return false
      }
    })
  }

  //  END:  raw interval parser
  // ======================================================
  // START: speak aloud methods

  saySomething (text) {
    const sayThis = new SpeechSynthesisUtterance(text)
    const voiceName = 'English (Australia)'

    sayThis.volume = 2
    sayThis.rate = 1
    sayThis.pitch = 1
    sayThis.voice = speechSynthesis.getVoices().filter(function (voice) {
      return voice.name === voiceName
    })[0]

    this.voice.speak(sayThis)
  }

  /**
   * speakAfterSeconds() uses the Web Speech API's Speech Synthisis
   * interface to announce time intervals for the talking-timer
   *
   * @param {string} text Information to be spoken
   * @param {number} seconds time before the text is to be spoken.
   *
   * @returns {Promise}
   */
  speakAfterSeconds (text, seconds) {
    const speakAfterSecondsCallback = async () => {
      const milliseconds = seconds * 1000
      // SpeechSynthesis.speak(text)
      window.setTimeout(text, milliseconds)
    }
    return speakAfterSecondsCallback
  }

  /**
   * speakInterval() uses the Web Speech API's Speech Synthisis
   * interface to announce time intervals at a fixed interval
   *
   * @param {string} text Information to be spoken
   * @param {number} interval number of seconds for the interval
   *                 between when last text was spoken and when the
   *                 next speaking commences
   *
   * @returns {Promise}
   */
  speakInterval (text, interval) {

  }

  /**
   * speakIntervalAfterSeconds() uses the Web Speech API's Speech
   * Synthisis interface to announce time intervals at a fixed
   * interval starting after a specified number of seconds
   *
   * @param {string} text Information to be spoken
   * @param {number} seconds time before the text is to be spoken.
   *
   * @returns {Promise}
   */
  speakIntervalAfterSeconds (text, seconds) {

  }

  endSound () {
    /**
     * @var {number} duration the length of time (in seconds) a
     *               sound makes
     */
    const durationTime = 0.75
    /**
     * @var {number} interval the number of seconds between sounds
     *               starting
     */
    const interval = 0.425
    /**
     * @var {number} ramp no idea what this is for. See MDN docs
     * https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/exponentialRampToValueAtTime
     */
    const ramp = 0.00001
    /**
     * @var {array} tones list of frequencies to be played
     */
    const tones = [440, 261.6, 830.6, 440, 261.6, 830.6, 392, 440, 261.6, 830.6, 440, 261.6, 830.6, 392, 440]

    /**
     * @var {number} offset number of milliseconds from calling the
     *               sound is to start playing
     */
    let offset = 0

    var context = new AudioContext()

    function playTone (frequency, duration, offset) {
      return function (resolve, reject) {
        var oscillator = context.createOscillator()
        var gain = context.createGain()

        oscillator.connect(gain)

        gain.connect(context.destination)
        gain.gain.exponentialRampToValueAtTime(
          ramp,
          context.currentTime + duration
        )

        oscillator.frequency.value = frequency
        oscillator.start(0)
      }
    }

    for (let a = 0; a < tones.length; a += 1) {
      let promise = new Promise(function (resolve, reject) {
        const toneFunc = playTone(tones[a], durationTime, offset)
        window.setTimeout(toneFunc, offset)
      })
      offset += (interval * 1000)
    }
  }

  //  END:  speak aloud methods
  // ======================================================
}

customElements.define('talking-timer', TalkingTimer)
