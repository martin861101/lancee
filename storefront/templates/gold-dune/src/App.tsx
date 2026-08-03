import Header from './components/Header'
import Hero from './components/Hero'
import Services from './components/Services'
import Process from './components/Process'
import Stats from './components/Stats'
import Stack from './components/Stack'
import About from './components/About'
import CTA from './components/CTA'
import Footer from './components/Footer'

function App() {
  return (
    <>
      <div className="noise" aria-hidden="true" />
      <Header />
      <Hero />
      <Stats />
      <Services />
      <Process />
      <Stack />
      <About />
      <CTA />
      <Footer />
    </>
  )
}

export default App
