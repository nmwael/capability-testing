interface CatalogueEntry {
  type: string
  values?: string[]
}

interface CapFieldCatalogueProps {
  catalogue: Record<string, CatalogueEntry>
  className?: string
  maxColumns?: number
}

function CapFieldCatalogue({ catalogue, className = 'cap-catalogue', maxColumns = 4 }: CapFieldCatalogueProps) {
  const entries = Object.entries(catalogue)

  const getColumns = (index: number) => {
    const colIndex = Math.floor(index / maxColumns)
    const row = index % maxColumns
    return {
      col: colIndex + 1,
      row: row + 1,
      left: colIndex * (100 / maxColumns),
      top: (row / maxColumns) * 100,
    }
  }

  return (
    <div className={className} data-testid="cap-field-catalogue">
      <div className="cap-catalogue-header" data-testid="cap-field-catalogue-header">
        <h3 data-testid="cap-field-catalogue-title">CAP Field Catalogue</h3>
        <p data-testid="cap-field-catalogue-field-count">{Object.keys(catalogue).length} fields</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${maxColumns}, 1fr)`, gap: '1rem' }}>
        {entries.map(([name, entry], index) => {
          const hasValues = entry.values && entry.values.length > 0
          const position = getColumns(index)

          return (
            <div
              key={name}
              data-testid={`cap-field-catalogue-item-${name}`}
              style={{
                gridColumn: `${position.col}`,
                gridRow: `${position.row}`,
                gridRowStart: `${position.row}`,
                gridRowEnd: `${position.row + 1}`,
                gridColumnStart: `${position.col}`,
                gridColumnEnd: `${position.col + 1}`,
              }}
            >
              <div className="cap-catalogue-item">
                <div className="cap-catalogue-field" data-testid="cap-field-catalogue-field">
                  <span data-testid="cap-field-catalogue-field-name">{name}</span>
                  <span className="cap-catalogue-type" data-testid="cap-field-catalogue-type">{entry.type}</span>
                </div>
                {hasValues && entry.values && (
                  <div className="cap-catalogue-values" data-testid="cap-field-catalogue-values">
                    {entry.values.map((v, i) => (
                      <span key={i} className="cap-catalogue-value" data-testid="cap-field-catalogue-value">{v}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { CapFieldCatalogue }