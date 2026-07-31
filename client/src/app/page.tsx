import VisaConsultation from '@/components/VisaConsultation'
import AboutSection from '@/components/sections/AboutSection'
import ServicesSection from '@/components/sections/ServicesSection'
import ContactSection from '@/components/sections/ContactSection'
import React from 'react'

const page = () => {
  return (
    <div>
      <section id="home">
        <VisaConsultation/>
      </section>
      <AboutSection />
      <ServicesSection />
      <ContactSection />
    </div>
  )
}

export default page