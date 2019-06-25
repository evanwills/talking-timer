# countdown-timer

A custom element for visual and audio countdown timing. (For when my kids need to stop doing a thing they don't want to stop. And for when I'm teaching and running a time sensitive exercise)

## How it works

At it's most basic you can configure a reusable timer like so: (this is a three minute timer)
``` html
<countdown-timer start="03:00">My timer</countdown-timer>
```

## Attributes

### `start`

The `start` attribute is required and can either be the total number of seconds or a time string (`HH:MM:SS` - hours & minutes are optional)

### `no-speak` / `speak`

> __NOTE:__ Speak aloud functionality is not yet implemented

`no-speak` and `speak` attributes control the speak aloud options and contain a space separated list of keywords.

> __NOTE:__ `no-speak` and `speak` attributes are mutually exclucive.
> 
> You should never use both in the same element.
> 
> If both are used __`no-speak` is *ignored*__.

__`no-speak`__ blacklists the specified options so they are not spoken.

__`speak`__ whitelists the specified options so only those specified are spoken.

#### `speak` / `no-speak` options

By default all options are spoken

* `quarters` - (for start times that are evenly divisible by four) speak 3/4 and 1/4 intervals
* `thirds`  - (for start times that are evenly divisible by 3) speak 2/3 and 1/3 intervals
* `halfway` - speak the halfway interval
* `minutes` - speak each minute remaining
* `30seconds` - speak every 30 seconds remaining (includes minutes)
* `last20` - speak last 20 seconds warning
* `last15` - speak last 15 seconds warning
* `allLast10` - speak last 10 second countdown


``` HTML
<!-- -->
<countdown-timer start="03:00" speak="minutes allLast10">
  Only speak minute intervals and countdown last 10 seconds
</countdown-timer>

<countdown-timer start="03:00" no-speak="quarters halfway last20 minutes">
  Only speak thirds, 30 second intervals (when they're not thirds) and
  last second announcements
</countdown-timer>

<countdown-timer start="03:00">
  Speak all announcements
</countdown-timer>

<countdown-timer start="03:00" speak="">
  Nothing in speak (i.e. empty whitelist)
  Don't speak any announcments - Silent
</countdown-timer>
```

> __NOTE:__ When announcements overlap (e.g. 3 minute time with minutes and thirds) Minute announcements are spoken and fractions are skipped

### `auto-destruct`

If `auto-destruct` is set, then the timer will remove itself thirty seconds after completion or as many seconds as the timer ran for (which ever is shorter).

``` HTML
<countdown-timer start="03:00" auto-destruct>
  Self destruct after 30 seconds
</countdown-timer>

<countdown-timer start="03:00" auto-destruct="true">
  Self destruct after 30 seconds
</countdown-timer>

<countdown-timer start="03:00" auto-destruct="600">
  Self destruct after 10 minutes
</countdown-timer>
```

> __NOTE:__ If `auto-destruct` has a numeric value, then that number will set the number of seconds, after which, the node will remove itself.

> __NOTE ALSO:__ If the value of `auto-destruct` is greater than 43200 (12 hours) 43200 will be used.

### `no-restart`

Excludes the `Start again` button from the UI

### `no-reset`

Excludes the `Reset` button from the UI
