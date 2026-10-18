import { FAKE_VIDEO } from '../../playwright.config'
import { makeVideo } from './make-video'

export default function globalSetup(): void {
  makeVideo(FAKE_VIDEO)
}
