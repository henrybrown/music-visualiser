import React, { useState, useEffect } from 'react';
import { useAnimationEngine } from './animation-engine-context';

interface EntityData {
  context: Record<string, unknown>;
  elements: ElementData[];
}

interface ElementData {
  elementId: string;
  metadata: {
    elementId: string;
    entityId: string;
    tagName: string;
    className: string;
  };
  animations: string[];
  isAnimating: boolean;
}

/**
 * Animation devtools panel
 *
 * Reads directly from the animation engine via getEngineInfo() - no hacks needed.
 * Just a read-only view into the engine's state.
 */
export const DevToolsPanel: React.FC<{
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  defaultOpen?: boolean;
  theme?: 'dark' | 'light';
}> = ({ position = 'bottom-right', defaultOpen = false, theme = 'dark' }) => {
  const engine = useAnimationEngine();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setCurrentTime(Date.now()), 100);
    return () => clearInterval(interval);
  }, [isOpen]);

  const toggleEntity = (entityId: string) => {
    setExpandedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) {
        next.delete(entityId);
      } else {
        next.add(entityId);
      }
      return next;
    });
  };

  // Read data directly from engine via public API
  const engineInfo = engine.getEngineInfo();

  const getEntityGroups = (): Map<string, EntityData> => {
    const { registry, runningAnimations } = engineInfo;
    const entities = new Map<string, EntityData>();

    registry.forEach((elements, entityId) => {
      const context = engine.getEntityContext(entityId) || {};
      const elementList: ElementData[] = [];

      elements.forEach(({ element, animations }, elementId) => {
        // Check if any animations are running for this element
        const animKeyPrefix = `${entityId}-${elementId}`;
        const isAnimating = Array.from(runningAnimations.keys()).some(
          (key) => key.startsWith(animKeyPrefix)
        );

        elementList.push({
          elementId,
          metadata: {
            elementId,
            entityId,
            tagName: element.tagName,
            className: element.className,
          },
          animations: Object.keys(animations),
          isAnimating,
        });
      });

      entities.set(entityId, {
        context,
        elements: elementList,
      });
    });

    return entities;
  };

  const entities = getEntityGroups();
  const { registry, runningAnimations } = engineInfo;

  const isDark = theme === 'dark';
  const styles = getStyles(isDark, position);

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} style={styles.button}>
        🎬 Animation Devtools
      </button>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h3 style={styles.title}>🎬 Animation Devtools</h3>
        <button onClick={() => setIsOpen(false)} style={styles.closeButton}>
          ×
        </button>
      </div>

      <div style={styles.stats}>
        <span>📦 Entities: {entities.size}</span>
        <span>⚙️ Registered: {registry.size}</span>
        <span>▶ Running: {runningAnimations.size}</span>
      </div>

      <div style={styles.content}>
        {Array.from(entities.entries()).map(([entityId, entity]) => (
          <EntityView
            key={entityId}
            entityId={entityId}
            entity={entity}
            isExpanded={expandedEntities.has(entityId)}
            onToggle={() => toggleEntity(entityId)}
            theme={theme}
          />
        ))}
        {entities.size === 0 && (
          <div style={styles.emptyState}>No entities registered yet...</div>
        )}
      </div>
    </div>
  );
};

const EntityView: React.FC<{
  entityId: string;
  entity: EntityData;
  isExpanded: boolean;
  onToggle: () => void;
  theme: string;
}> = ({ entityId, entity, isExpanded, onToggle, theme }) => {
  const isDark = theme === 'dark';
  const { context } = entity;

  const word = typeof context.word === 'string' ? context.word : entityId;
  const displayState = typeof context.displayState === 'string' ? context.displayState : undefined;
  const teamName = typeof context.teamName === 'string' ? context.teamName : undefined;
  const selected = !!context.selected;
  const isTransitioning = !!context.isTransitioning;
  const viewMode = typeof context.viewMode === 'string' ? context.viewMode : undefined;

  const accentColor = isDark ? '#00ff88' : '#000';
  const borderColorLight = isDark ? '#00ff8833' : '#ddd';
  const borderColorLighter = isDark ? '#00ff8822' : '#e5e5e5';
  const bgAccent = isDark ? 'rgba(0, 255, 136, 0.08)' : 'rgba(0, 0, 0, 0.05)';
  const bgAccentLight = isDark ? 'rgba(0, 255, 136, 0.03)' : 'rgba(0, 0, 0, 0.02)';

  const styles = {
    container: {
      background: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.5)',
      border: `1px solid ${borderColorLight}`,
      borderRadius: '8px',
      marginBottom: '1rem',
      overflow: 'hidden',
      transition: 'all 0.2s',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.75rem',
      cursor: 'pointer',
      background: isExpanded ? bgAccent : 'transparent',
      transition: 'background 0.2s',
    },
    title: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      flex: 1,
    },
    entityName: {
      fontWeight: 'bold' as const,
      color: accentColor,
      fontSize: '1rem',
    },
    badges: {
      display: 'flex',
      gap: '0.5rem',
      alignItems: 'center',
      flexWrap: 'wrap' as const,
    },
    badge: {
      padding: '0.2rem 0.5rem',
      borderRadius: '4px',
      fontSize: '0.7rem',
      fontWeight: 'bold' as const,
    },
    content: {
      padding: '0.75rem',
      borderTop: `1px solid ${borderColorLighter}`,
      display: isExpanded ? 'block' : 'none',
    },
    contextSection: {
      background: bgAccentLight,
      border: `1px solid ${borderColorLighter}`,
      borderRadius: '6px',
      padding: '0.75rem',
      marginBottom: '1rem',
    },
    contextGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: '0.5rem',
      fontSize: '0.75rem',
    },
    elements: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
      gap: '0.5rem',
    },
    expandIcon: {
      color: isDark ? '#00ff8866' : '#666',
      fontSize: '1.2rem',
      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
      transition: 'transform 0.2s',
    },
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'hidden': return '#666';
      case 'visible': return '#0099ff';
      case 'visible-colored': return '#ff9900';
      case 'visible-covered': return '#00ff88';
      default: return '#888';
    }
  };

  const getTeamColor = (team: string) => {
    switch (team) {
      case 'red': return '#ff4444';
      case 'blue': return '#4444ff';
      case 'assassin': return '#ffff00';
      case 'neutral': return '#888';
      default: return '#666';
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header} onClick={onToggle}>
        <div style={styles.title}>
          <span style={styles.entityName}>{word}</span>
          <div style={styles.badges}>
            {displayState && (
              <span style={{ ...styles.badge, background: getStateColor(displayState), color: '#fff' }}>
                {displayState}
              </span>
            )}
            {teamName && (
              <span style={{
                ...styles.badge,
                background: getTeamColor(teamName),
                color: teamName === 'assassin' ? '#000' : '#fff',
              }}>
                {teamName}
              </span>
            )}
            {selected && (
              <span style={{ ...styles.badge, background: '#00ff88', color: '#000' }}>
                selected
              </span>
            )}
            {isTransitioning && (
              <span style={{ ...styles.badge, background: '#ff00ff', color: '#fff' }}>
                transitioning
              </span>
            )}
            {viewMode && (
              <span style={{ ...styles.badge, background: '#0099ff', color: '#fff' }}>
                {viewMode}
              </span>
            )}
          </div>
        </div>
        <span style={styles.expandIcon}>▼</span>
      </div>

      {isExpanded && (
        <div style={styles.content}>
          <div style={styles.contextSection}>
            <h5 style={{ margin: '0 0 0.5rem 0', color: accentColor, fontSize: '0.8rem' }}>
              Entity Context
            </h5>
            <div style={styles.contextGrid}>
              {Object.entries(context).map(([key, value]) => (
                <div key={key}>
                  <span style={{ color: isDark ? '#00ff8866' : '#666' }}>{key}: </span>
                  <span style={{ color: isDark ? '#fff' : '#000' }}>
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <h5 style={{ margin: '0 0 0.5rem 0', color: accentColor, fontSize: '0.8rem' }}>
            Elements ({entity.elements.length})
          </h5>
          <div style={styles.elements}>
            {entity.elements.map((element, i) => (
              <ElementView key={`${element.elementId}-${i}`} element={element} theme={theme} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ElementView: React.FC<{
  element: ElementData;
  theme: string;
}> = ({ element, theme }) => {
  const isDark = theme === 'dark';
  const borderColor = element.isAnimating
    ? '#00aaff'
    : (isDark ? '#444' : '#ccc');

  const styles = {
    container: {
      background: isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.8)',
      border: `2px solid ${borderColor}`,
      borderRadius: '6px',
      padding: '0.75rem',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '0.5rem',
    },
    name: {
      fontWeight: 'bold' as const,
      color: isDark ? '#fff' : '#000',
      fontSize: '0.85rem',
    },
    metadata: {
      fontSize: '0.6rem',
      color: '#888',
    },
    animations: {
      display: 'flex',
      flexWrap: 'wrap' as const,
      gap: '0.25rem',
      marginTop: '0.25rem',
    },
    animationTag: {
      background: isDark ? 'rgba(0, 255, 136, 0.1)' : 'rgba(0, 0, 0, 0.08)',
      color: isDark ? '#00ff88' : '#000',
      padding: '0.1rem 0.3rem',
      borderRadius: '3px',
      fontSize: '0.6rem',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.name}>{element.metadata.elementId}</div>
      {element.isAnimating && (
        <div style={{ color: '#00aaff', fontSize: '0.7rem' }}>▶ Animating</div>
      )}
      <div style={styles.metadata}>
        {element.metadata.tagName} {element.metadata.className && `.${element.metadata.className}`}
      </div>
      <div style={styles.animations}>
        {element.animations.slice(0, 3).map((anim) => (
          <span key={anim} style={styles.animationTag}>
            {anim}
          </span>
        ))}
        {element.animations.length > 3 && (
          <span style={styles.animationTag}>+{element.animations.length - 3}</span>
        )}
      </div>
    </div>
  );
};

function getStyles(isDark: boolean, position: string) {
  const accentColor = isDark ? '#00ff88' : '#000';
  const borderColor = isDark ? '#00ff88' : '#333';
  const borderColorLight = isDark ? '#00ff8833' : '#ddd';
  const borderColorLighter = isDark ? '#00ff8822' : '#e5e5e5';
  const bgAccent = isDark ? 'rgba(0, 255, 136, 0.05)' : 'rgba(0, 0, 0, 0.03)';
  const bgAccentStrong = isDark ? 'rgba(0, 255, 136, 0.08)' : 'rgba(0, 0, 0, 0.05)';

  return {
    button: {
      position: 'fixed' as const,
      ...(position === 'bottom-right' && { bottom: '2rem', right: '2rem' }),
      ...(position === 'bottom-left' && { bottom: '2rem', left: '2rem' }),
      ...(position === 'top-right' && { top: '2rem', right: '2rem' }),
      ...(position === 'top-left' && { top: '2rem', left: '2rem' }),
      background: isDark ? '#0a0a0f' : '#fff',
      color: accentColor,
      border: `2px solid ${borderColor}`,
      borderRadius: '8px',
      padding: '0.75rem 1rem',
      fontWeight: 'bold' as const,
      cursor: 'pointer',
      zIndex: 9998,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '0.9rem',
    },
    panel: {
      position: 'fixed' as const,
      right: 0,
      top: 0,
      bottom: 0,
      width: '480px',
      background: isDark ? 'linear-gradient(to left, #0a0a0f 0%, #1a1a1f 100%)' : '#f5f5f5',
      borderLeft: `2px solid ${borderColor}`,
      overflowY: 'auto' as const,
      zIndex: 9999,
      boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.3)',
      color: isDark ? '#fff' : '#000',
      fontFamily: '"JetBrains Mono", monospace',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1rem',
      borderBottom: `1px solid ${borderColorLight}`,
      background: bgAccent,
      position: 'sticky' as const,
      top: 0,
      zIndex: 1,
      backdropFilter: 'blur(10px)',
    },
    title: {
      margin: 0,
      color: accentColor,
      fontSize: '1.2rem',
    },
    closeButton: {
      background: 'transparent',
      border: 'none',
      color: isDark ? '#00ff8866' : '#666',
      fontSize: '1.5rem',
      cursor: 'pointer',
      padding: 0,
      width: '2rem',
      height: '2rem',
    },
    stats: {
      display: 'flex',
      gap: '1rem',
      padding: '0.75rem 1rem',
      background: bgAccentStrong,
      borderBottom: `1px solid ${borderColorLighter}`,
      fontSize: '0.85rem',
      color: isDark ? '#88ffcc' : '#333',
    },
    content: {
      flex: 1,
      padding: '1rem',
      overflowY: 'auto' as const,
    },
    emptyState: {
      padding: '2rem',
      textAlign: 'center' as const,
      color: '#888',
      fontSize: '0.9rem',
    },
  };
}
