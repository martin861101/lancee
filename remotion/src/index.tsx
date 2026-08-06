import { Composition, registerRoot } from 'remotion'
import {
  DASHBOARD_TOUR_DURATION,
  DASHBOARD_TOUR_FPS,
  DashboardTour,
} from './dashboard-tour/DashboardTour'
import { StorefrontPreview, type StorefrontTemplateId } from './StorefrontPreview'

const templateIds: StorefrontTemplateId[] = ['black-white', 'blue-splash', 'gold-dune', 'red-tech', 'gsap-flowish']

const compositionProps = {
  width: 1280,
  height: 720,
  fps: 30,
  durationInFrames: 240,
}

export const RemotionRoot = () => (
  <>
    <Composition
      id="DashboardTour"
      component={DashboardTour}
      durationInFrames={DASHBOARD_TOUR_DURATION}
      fps={DASHBOARD_TOUR_FPS}
      width={1920}
      height={1080}
    />
    <Composition
      id="StorefrontPreview"
      component={StorefrontPreview}
      durationInFrames={compositionProps.durationInFrames}
      fps={compositionProps.fps}
      width={compositionProps.width}
      height={compositionProps.height}
      defaultProps={{ template: 'black-white' }}
    />
    {templateIds.slice(1).map((template) => (
      <Composition
        key={template}
        id={`StorefrontPreview-${template}`}
        component={StorefrontPreview}
        durationInFrames={compositionProps.durationInFrames}
        fps={compositionProps.fps}
        width={compositionProps.width}
        height={compositionProps.height}
        defaultProps={{ template }}
      />
    ))}
  </>
)

registerRoot(RemotionRoot)
