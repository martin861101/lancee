# Dashboard tour video

The dashboard tour is a 1920×1080, 30 fps Remotion composition that presents
all 17 dashboard routes in a single H.264 clip. It uses real browser captures
from the dark dashboard theme, a short title card, overlapping crossfades, page
labels, and a progress marker.

## Included pages

Home, Clients, Projects, Ideas, Automations, Results, Workflows, Storefront,
Connections, Services, Money, Analytics, Files, Messages, Team, API, and
Settings are included in route order.

The source captures live in `remotion/public/dashboard-tour/`. The Remotion
composition is implemented in `remotion/src/dashboard-tour/`, and the rendered
artifact is `public/dashboard-tour.mp4`.

## Render

Install the isolated video dependencies once, then render from the repository
root:

```bash
npm --prefix remotion install
npm --prefix remotion run render:dashboard
```

The output is approximately 35 seconds long. The animation is deterministic:
all motion is driven by Remotion frames, and no browser CSS animation or
transition is required during rendering.

## Updating the clip

Refresh the PNG captures after a meaningful dashboard redesign, retaining the
numbered filenames listed in `remotion/src/dashboard-tour/scenes.ts`. Then run
the dashboard render command again. Descriptions and page order can be changed
in the same scene manifest without changing the animation component.
