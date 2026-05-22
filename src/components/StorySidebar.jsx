import { useEffect, useEffectEvent, useRef } from 'react'

export default function StorySidebar({
  steps,
  activeStepId,
  onStepChange,
  relationships,
}) {
  const stepRefs = useRef({})
  const activeStepIdRef = useRef(activeStepId)
  const handleStepChange = useEffectEvent(onStepChange)

  useEffect(() => {
    activeStepIdRef.current = activeStepId
  }, [activeStepId])

  useEffect(() => {
    let animationFrame = null

    const readActiveStep = () => {
      animationFrame = null

      const stepNodes = steps
        .map((step) => stepRefs.current[step.id])
        .filter(Boolean)

      if (!stepNodes.length) {
        return
      }

      const activationY = window.innerHeight * 0.46
      const firstNode = stepNodes[0]
      const lastNode = stepNodes[stepNodes.length - 1]
      let nextStepId = null

      for (const node of stepNodes) {
        const rect = node.getBoundingClientRect()
        if (rect.top <= activationY && rect.bottom > activationY) {
          nextStepId = node.dataset.stepId
          break
        }
      }

      if (!nextStepId && firstNode.getBoundingClientRect().top > activationY) {
        nextStepId = firstNode.dataset.stepId
      }

      if (!nextStepId && lastNode.getBoundingClientRect().bottom <= activationY) {
        nextStepId = lastNode.dataset.stepId
      }

      if (!nextStepId) {
        nextStepId = stepNodes
          .map((node) => {
            const rect = node.getBoundingClientRect()
            return {
              node,
              distance: Math.abs((rect.top + rect.bottom) / 2 - activationY),
            }
          })
          .sort((left, right) => left.distance - right.distance)[0].node.dataset.stepId
      }

      if (nextStepId && nextStepId !== activeStepIdRef.current) {
        activeStepIdRef.current = nextStepId
        handleStepChange(nextStepId)
      }
    }

    const scheduleRead = () => {
      if (animationFrame == null) {
        animationFrame = requestAnimationFrame(readActiveStep)
      }
    }

    scheduleRead()
    window.addEventListener('scroll', scheduleRead, { passive: true })
    window.addEventListener('resize', scheduleRead)

    return () => {
      if (animationFrame != null) {
        cancelAnimationFrame(animationFrame)
      }
      window.removeEventListener('scroll', scheduleRead)
      window.removeEventListener('resize', scheduleRead)
    }
  }, [handleStepChange, steps])

  return (
    <div className="story-stack">
      <section className="hero-card">
        <p className="eyebrow">Boston</p>
        <div className="hero-heading">
          <div>
            <h1>The Thermal Divide</h1>
            <p className="hero-copy">
              Heat, tree canopy, and economic stress across neighborhoods.
            </p>
          </div>
        </div>
      </section>

      {steps.map((step) => (
        <section
          key={step.id}
          ref={(node) => {
            stepRefs.current[step.id] = node
          }}
          data-step-id={step.id}
          className={`story-step ${step.id === 'relationships' ? 'relationship-step' : ''} ${
            activeStepId === step.id ? 'active' : ''
          }`}
        >
          <p className="eyebrow">{step.step}</p>
          <h2>{step.title}</h2>
          <p>{step.body}</p>
          {step.id === 'relationships' ? relationships : null}
        </section>
      ))}

      <section className="source-note">
        <p className="eyebrow">Data Sources</p>
        <p>
          Heat data from Climate Ready Boston Extreme Heat Data; tree canopy from the
          2019-2024 Tree Canopy Assessment; income and poverty from Neighborhood
          Demographics (ACS); geography from Boston Neighborhood Boundaries and Open
          Space.
        </p>
      </section>
    </div>
  )
}
