package hub

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	StockInStock    = "in_stock"
	StockLowStock   = "low_stock"
	StockOutOfStock = "out_of_stock"
	StockPreorder   = "preorder"
)

var validSizeCategories = []string{"XS", "S", "M", "L", "XL"}

type SizeChartEntry struct {
	Category    string    `json:"category"` // XS, S, M, L, XL
	Label       string    `json:"label"`
	NameID      string    `json:"name_id"` // Sangat kecil, Kecil, Sedang, Besar, Sangat besar
	MinMM       float64   `json:"min_mm"`
	MaxMM       float64   `json:"max_mm"`
	BridgeMMRec string    `json:"bridge_mm_rec"`
	TempleMMRec string    `json:"temple_mm_rec"`
	Description string    `json:"description"`
	SortOrder   int       `json:"sort_order"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type TryOnRenderConfig struct {
	WidthMultiplier float64 `json:"widthMultiplier"`
	VerticalOffset  float64 `json:"verticalOffset"`
	BridgeOffset    float64 `json:"bridgeOffset"`
}

type CatalogFrame struct {
	ID            string            `json:"id"`
	SKU           string            `json:"sku"`
	Name          string            `json:"name"`
	FrameWidthMM  float64           `json:"frame_width_mm"`
	BridgeMM      float64           `json:"bridge_mm"`
	TempleMM      float64           `json:"temple_mm"`
	SizeCategory  string            `json:"size_category"` // XS, S, M, L, XL
	FrameStyle    string            `json:"frame_style"`
	FaceShapes    []string          `json:"face_shapes"`
	Color         string            `json:"color"`
	Material      string            `json:"material"`
	PriceIDR      int64             `json:"price_idr"`
	ThumbnailURL  string            `json:"thumbnail_url"`
	TryOnAssetURL string            `json:"tryon_asset_url"`
	TryOnSprites  map[string]string `json:"tryon_sprites,omitempty"`
	TryOnConfig   TryOnRenderConfig `json:"tryon_config"`
	StockStatus   string            `json:"stock_status"` // in_stock|low_stock|out_of_stock|preorder
	IsActive      bool              `json:"is_active"`
	SortOrder     int               `json:"sort_order"`
	CreatedAt     time.Time         `json:"created_at"`
	UpdatedAt     time.Time         `json:"updated_at"`
}

type CatalogFilter struct {
	Size            string  `json:"size,omitempty"`
	WidthMM         float64 `json:"width_mm,omitempty"`
	IncludeAdjacent bool    `json:"include_adjacent,omitempty"`
	FaceShape       string  `json:"face_shape,omitempty"`
	StockStatus     string  `json:"stock,omitempty"`
	InStockOnly     bool    `json:"in_stock_only,omitempty"`
	FrameStyle      string  `json:"style,omitempty"`
	Query           string  `json:"q,omitempty"`
	IncludeInactive bool    `json:"include_inactive,omitempty"`
}

type CatalogImportPayload struct {
	SizeChart  []SizeChartEntry `json:"size_chart,omitempty"`
	Frames     []CatalogFrame   `json:"frames,omitempty"`
	ReplaceAll bool             `json:"replace_all,omitempty"`
}

// DefaultSizeChart returns the official DOOZ Single Source of Truth size chart (XS-XL).
func DefaultSizeChart(now time.Time) []SizeChartEntry {
	if now.IsZero() {
		now = time.Date(2026, 11, 16, 0, 0, 0, 0, time.UTC)
	}
	return []SizeChartEntry{
		{
			Category:    "XS",
			Label:       "Extra Small (XS)",
			NameID:      "Sangat kecil",
			MinMM:       115,
			MaxMM:       127,
			BridgeMMRec: "15–17 mm",
			TempleMMRec: "135–138 mm",
			Description: "Wajah mungil / remaja",
			SortOrder:   1,
			UpdatedAt:   now,
		},
		{
			Category:    "S",
			Label:       "Small (S)",
			NameID:      "Kecil",
			MinMM:       128,
			MaxMM:       133,
			BridgeMMRec: "16–18 mm",
			TempleMMRec: "138–140 mm",
			Description: "Wajah ramping",
			SortOrder:   2,
			UpdatedAt:   now,
		},
		{
			Category:    "M",
			Label:       "Medium (M)",
			NameID:      "Sedang",
			MinMM:       134,
			MaxMM:       139,
			BridgeMMRec: "17–19 mm",
			TempleMMRec: "140–145 mm",
			Description: "Ukuran standar mayoritas dewasa",
			SortOrder:   3,
			UpdatedAt:   now,
		},
		{
			Category:    "L",
			Label:       "Large (L)",
			NameID:      "Besar",
			MinMM:       140,
			MaxMM:       145,
			BridgeMMRec: "18–20 mm",
			TempleMMRec: "143–148 mm",
			Description: "Wajah lebar",
			SortOrder:   4,
			UpdatedAt:   now,
		},
		{
			Category:    "XL",
			Label:       "Extra Large (XL)",
			NameID:      "Sangat besar",
			MinMM:       146,
			MaxMM:       165,
			BridgeMMRec: "19–22 mm",
			TempleMMRec: "145–152 mm",
			Description: "Wajah ekstra lebar",
			SortOrder:   5,
			UpdatedAt:   now,
		},
	}
}

// DefaultCatalogFrames returns the default DOOZ active frame SKUs spanning XS through XL.
func DefaultCatalogFrames(now time.Time) []CatalogFrame {
	if now.IsZero() {
		now = time.Date(2026, 11, 16, 0, 0, 0, 0, time.UTC)
	}
	return []CatalogFrame{
		{
			ID:            "glasses-1",
			SKU:           "DOOZ-CLS-001",
			Name:          "Classic Black",
			FrameWidthMM:  138,
			BridgeMM:      18,
			TempleMM:      142,
			SizeCategory:  "M",
			FrameStyle:    "rectangle",
			FaceShapes:    []string{"oval", "round"},
			Color:         "Black",
			Material:      "Acetate",
			PriceIDR:      299000,
			ThumbnailURL:  "/images/1.png",
			TryOnAssetURL: "/images/1.png",
			TryOnConfig: TryOnRenderConfig{
				WidthMultiplier: 1.4,
				VerticalOffset:  0.015,
				BridgeOffset:    0,
			},
			StockStatus: StockInStock,
			IsActive:    true,
			SortOrder:   1,
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		{
			ID:            "glasses-2",
			SKU:           "DOOZ-AVI-002",
			Name:          "Modern Aviator",
			FrameWidthMM:  142,
			BridgeMM:      19,
			TempleMM:      145,
			SizeCategory:  "L",
			FrameStyle:    "aviator",
			FaceShapes:    []string{"oval", "heart", "square"},
			Color:         "Gold/Black",
			Material:      "Metal",
			PriceIDR:      349000,
			ThumbnailURL:  "/images/2.png",
			TryOnAssetURL: "/images/2.png",
			TryOnConfig: TryOnRenderConfig{
				WidthMultiplier: 1.35,
				VerticalOffset:  0.02,
				BridgeOffset:    0,
			},
			StockStatus: StockInStock,
			IsActive:    true,
			SortOrder:   2,
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		{
			ID:            "glasses-3",
			SKU:           "DOOZ-RND-003",
			Name:          "Retro Round",
			FrameWidthMM:  132,
			BridgeMM:      17,
			TempleMM:      140,
			SizeCategory:  "S",
			FrameStyle:    "round",
			FaceShapes:    []string{"square", "oval", "oblong"},
			Color:         "Silver",
			Material:      "Metal",
			PriceIDR:      329000,
			ThumbnailURL:  "/images/3.png",
			TryOnAssetURL: "/images/3.png",
			TryOnSprites: map[string]string{
				"0":  "/images/3/0.png",
				"15": "/images/3/15.png",
				"30": "/images/3/30.png",
				"45": "/images/3/45.png",
			},
			TryOnConfig: TryOnRenderConfig{
				WidthMultiplier: 1.3,
				VerticalOffset:  0.015,
				BridgeOffset:    0,
			},
			StockStatus: StockInStock,
			IsActive:    true,
			SortOrder:   3,
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		{
			ID:            "glasses-4",
			SKU:           "DOOZ-SPT-004",
			Name:          "Sport Wrap",
			FrameWidthMM:  148,
			BridgeMM:      20,
			TempleMM:      148,
			SizeCategory:  "XL",
			FrameStyle:    "wraparound",
			FaceShapes:    []string{"oval", "round", "square"},
			Color:         "Black",
			Material:      "TR90/Nylon",
			PriceIDR:      379000,
			ThumbnailURL:  "/images/4.png",
			TryOnAssetURL: "/images/4.png",
			TryOnConfig: TryOnRenderConfig{
				WidthMultiplier: 1.45,
				VerticalOffset:  0.02,
				BridgeOffset:    0,
			},
			StockStatus: StockLowStock,
			IsActive:    true,
			SortOrder:   4,
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		{
			ID:            "glasses-5",
			SKU:           "DOOZ-BRW-005",
			Name:          "Designer Browline",
			FrameWidthMM:  126,
			BridgeMM:      16,
			TempleMM:      138,
			SizeCategory:  "XS",
			FrameStyle:    "browline",
			FaceShapes:    []string{"oval", "square", "heart"},
			Color:         "Havana/Gold",
			Material:      "Acetate/Metal",
			PriceIDR:      399000,
			ThumbnailURL:  "/images/5.png",
			TryOnAssetURL: "/images/5.png",
			TryOnConfig: TryOnRenderConfig{
				WidthMultiplier: 1.35,
				VerticalOffset:  0.018,
				BridgeOffset:    0,
			},
			StockStatus: StockInStock,
			IsActive:    true,
			SortOrder:   5,
			CreatedAt:   now,
			UpdatedAt:   now,
		},
	}
}

func DefaultCatalogFramesMap(now time.Time) map[string]*CatalogFrame {
	out := make(map[string]*CatalogFrame)
	for _, f := range DefaultCatalogFrames(now) {
		cp := f
		out[cp.SKU] = &cp
	}
	return out
}

func (s *Store) ensureCatalogSeededLocked(now time.Time) {
	if len(s.data.SizeChart) == 0 {
		s.data.SizeChart = DefaultSizeChart(now)
	}
	if s.data.CatalogFrames == nil {
		s.data.CatalogFrames = make(map[string]*CatalogFrame)
	}
	if len(s.data.CatalogFrames) == 0 {
		s.data.CatalogFrames = DefaultCatalogFramesMap(now)
	}
}

func normalizeSizeCategoryCode(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

func isValidSizeCategoryCode(code string) bool {
	c := normalizeSizeCategoryCode(code)
	for _, valid := range validSizeCategories {
		if c == valid {
			return true
		}
	}
	return false
}

func categorySortOrder(code string) int {
	switch normalizeSizeCategoryCode(code) {
	case "XS":
		return 1
	case "S":
		return 2
	case "M":
		return 3
	case "L":
		return 4
	case "XL":
		return 5
	default:
		return 99
	}
}

func isValidStockStatus(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case StockInStock, StockLowStock, StockOutOfStock, StockPreorder:
		return true
	default:
		return false
	}
}

// MatchSizeCategoryLocked maps a width in millimeters to the corresponding SizeChartEntry.
func (s *Store) MatchSizeCategoryLocked(widthMM float64) SizeChartEntry {
	chart := s.sortedSizeChartLocked()
	if len(chart) == 0 {
		chart = DefaultSizeChart(time.Now().UTC())
	}
	if widthMM <= 0 {
		for _, e := range chart {
			if e.Category == "M" {
				return e
			}
		}
		return chart[len(chart)/2]
	}
	for _, e := range chart {
		if widthMM <= e.MaxMM {
			return e
		}
	}
	return chart[len(chart)-1]
}

// MatchSizeCategory maps a width in millimeters to the corresponding SizeChartEntry (thread-safe).
func (s *Store) MatchSizeCategory(widthMM float64) SizeChartEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.MatchSizeCategoryLocked(widthMM)
}

func (s *Store) sortedSizeChartLocked() []SizeChartEntry {
	out := make([]SizeChartEntry, len(s.data.SizeChart))
	copy(out, s.data.SizeChart)
	sort.Slice(out, func(i, j int) bool {
		if out[i].SortOrder != out[j].SortOrder {
			return out[i].SortOrder < out[j].SortOrder
		}
		return out[i].MinMM < out[j].MinMM
	})
	return out
}

// GetSizeChart returns the sorted XS-XL size chart, latest update time, and deterministic ETag.
func (s *Store) GetSizeChart() ([]SizeChartEntry, time.Time, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	chart := s.sortedSizeChartLocked()
	var latest time.Time
	for _, e := range chart {
		if e.UpdatedAt.After(latest) {
			latest = e.UpdatedAt
		}
	}
	raw, _ := json.Marshal(chart)
	sum := sha256.Sum256(raw)
	etag := fmt.Sprintf(`"dooz-sc-%s"`, hex.EncodeToString(sum[:8]))
	return chart, latest, etag
}

// ValidateAndNormalizeSizeChart checks that all 5 categories (XS, S, M, L, XL) are present with valid ordered mm bounds.
func ValidateAndNormalizeSizeChart(entries []SizeChartEntry, now time.Time) ([]SizeChartEntry, error) {
	if len(entries) != 5 {
		return nil, ErrInvalidSizeChart
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	defaults := DefaultSizeChart(now)
	defaultByCat := make(map[string]SizeChartEntry, 5)
	for _, d := range defaults {
		defaultByCat[d.Category] = d
	}

	seen := make(map[string]SizeChartEntry, 5)
	for _, item := range entries {
		cat := normalizeSizeCategoryCode(item.Category)
		if !isValidSizeCategoryCode(cat) {
			return nil, ErrInvalidSizeChart
		}
		if item.MinMM <= 0 || item.MaxMM < item.MinMM {
			return nil, ErrInvalidSizeChart
		}
		def := defaultByCat[cat]
		if strings.TrimSpace(item.Label) == "" {
			item.Label = def.Label
		}
		if strings.TrimSpace(item.NameID) == "" {
			item.NameID = def.NameID
		}
		if strings.TrimSpace(item.BridgeMMRec) == "" {
			item.BridgeMMRec = def.BridgeMMRec
		}
		if strings.TrimSpace(item.TempleMMRec) == "" {
			item.TempleMMRec = def.TempleMMRec
		}
		if strings.TrimSpace(item.Description) == "" {
			item.Description = def.Description
		}
		item.Category = cat
		item.SortOrder = categorySortOrder(cat)
		item.UpdatedAt = now
		seen[cat] = item
	}

	if len(seen) != 5 {
		return nil, ErrInvalidSizeChart
	}

	ordered := make([]SizeChartEntry, 0, 5)
	for _, cat := range validSizeCategories {
		ordered = append(ordered, seen[cat])
	}
	for i := 1; i < len(ordered); i++ {
		if ordered[i].MinMM <= ordered[i-1].MaxMM {
			return nil, ErrInvalidSizeChart
		}
	}
	return ordered, nil
}

// UpdateSizeChart updates the XS-XL size chart in Store (Owner/Admin only), optionally recalculates frame size categories, and records an AuditLog.
func (s *Store) UpdateSizeChart(entries []SizeChartEntry, recalculateFrames bool, actorUserID, role, outletID string, now time.Time) ([]SizeChartEntry, error) {
	if role != RoleOwner && role != RoleAdmin {
		return nil, ErrUnauthorizedRole
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	normalized, err := ValidateAndNormalizeSizeChart(entries, now)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.data.SizeChart = normalized
	// Kategori "Ukuran Saya" selalu diturunkan dari mm + size-chart Katalog Bersama (SSOT).
	s.recalculateMeasurementCategoriesLocked(now)
	if recalculateFrames {
		for _, f := range s.data.CatalogFrames {
			if f.FrameWidthMM > 0 {
				f.SizeCategory = s.MatchSizeCategoryLocked(f.FrameWidthMM).Category
				f.UpdatedAt = now
			}
		}
	}

	s.appendAuditLogLocked(
		actorUserID,
		role,
		outletID,
		"catalog:size-chart",
		"catalog_update_size_chart",
		AuditAdminCatalog,
		fmt.Sprintf("Updated DOOZ official size chart XS-XL (recalculate_frames=%v)", recalculateFrames),
		now,
	)
	_ = s.persistLocked()

	out := make([]SizeChartEntry, len(normalized))
	copy(out, normalized)
	return out, nil
}

func cloneCatalogFrame(f *CatalogFrame) CatalogFrame {
	cp := *f
	if f.FaceShapes != nil {
		cp.FaceShapes = make([]string, len(f.FaceShapes))
		copy(cp.FaceShapes, f.FaceShapes)
	} else {
		cp.FaceShapes = []string{}
	}
	if f.TryOnSprites != nil {
		cp.TryOnSprites = make(map[string]string, len(f.TryOnSprites))
		for k, v := range f.TryOnSprites {
			cp.TryOnSprites[k] = v
		}
	}
	return cp
}

func adjacentSizeCategories(cat string) []string {
	c := normalizeSizeCategoryCode(cat)
	idx := -1
	for i, v := range validSizeCategories {
		if v == c {
			idx = i
			break
		}
	}
	if idx < 0 {
		return []string{c}
	}
	res := []string{c}
	if idx > 0 {
		res = append(res, validSizeCategories[idx-1])
	}
	if idx+1 < len(validSizeCategories) {
		res = append(res, validSizeCategories[idx+1])
	}
	return res
}

// ListCatalogFrames returns filtered catalog frames and a deterministic ETag.
func (s *Store) ListCatalogFrames(filter CatalogFilter) ([]CatalogFrame, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	allowedSizes := make(map[string]bool)
	if strings.TrimSpace(filter.Size) != "" {
		for _, part := range strings.Split(filter.Size, ",") {
			code := normalizeSizeCategoryCode(part)
			if code != "" {
				allowedSizes[code] = true
				if filter.IncludeAdjacent {
					for _, adj := range adjacentSizeCategories(code) {
						allowedSizes[adj] = true
					}
				}
			}
		}
	} else if filter.WidthMM > 0 {
		matched := s.MatchSizeCategoryLocked(filter.WidthMM).Category
		allowedSizes[matched] = true
		if filter.IncludeAdjacent {
			for _, adj := range adjacentSizeCategories(matched) {
				allowedSizes[adj] = true
			}
		}
	}

	wantFace := strings.ToLower(strings.TrimSpace(filter.FaceShape))
	wantStock := strings.ToLower(strings.TrimSpace(filter.StockStatus))
	wantStyle := strings.ToLower(strings.TrimSpace(filter.FrameStyle))
	wantQuery := strings.ToLower(strings.TrimSpace(filter.Query))

	var list []CatalogFrame
	for _, f := range s.data.CatalogFrames {
		if !filter.IncludeInactive && !f.IsActive {
			continue
		}
		if len(allowedSizes) > 0 && !allowedSizes[normalizeSizeCategoryCode(f.SizeCategory)] {
			continue
		}
		if filter.InStockOnly && strings.ToLower(f.StockStatus) == StockOutOfStock {
			continue
		}
		if wantStock != "" && strings.ToLower(f.StockStatus) != wantStock {
			continue
		}
		if wantStyle != "" && strings.ToLower(f.FrameStyle) != wantStyle {
			continue
		}
		if wantFace != "" {
			matchedFace := false
			for _, fs := range f.FaceShapes {
				if strings.ToLower(strings.TrimSpace(fs)) == wantFace {
					matchedFace = true
					break
				}
			}
			if !matchedFace {
				continue
			}
		}
		if wantQuery != "" {
			haystack := strings.ToLower(strings.Join([]string{
				f.SKU,
				f.ID,
				f.Name,
				f.SizeCategory,
				f.FrameStyle,
				f.Color,
				f.Material,
				strings.Join(f.FaceShapes, " "),
			}, " "))
			if !strings.Contains(haystack, wantQuery) {
				continue
			}
		}
		list = append(list, cloneCatalogFrame(f))
	}

	sort.Slice(list, func(i, j int) bool {
		if list[i].SortOrder != list[j].SortOrder {
			return list[i].SortOrder < list[j].SortOrder
		}
		return list[i].SKU < list[j].SKU
	})

	if list == nil {
		list = []CatalogFrame{}
	}

	raw, _ := json.Marshal(list)
	sum := sha256.Sum256(raw)
	etag := fmt.Sprintf(`"dooz-fr-%s"`, hex.EncodeToString(sum[:8]))
	return list, etag
}

// GetCatalogFrameBySKU retrieves a single catalog frame by SKU or ID.
func (s *Store) GetCatalogFrameBySKU(skuOrID string) (*CatalogFrame, error) {
	key := strings.TrimSpace(skuOrID)
	if key == "" {
		return nil, ErrFrameNotFound
	}
	s.mu.RLock()
	defer s.mu.RUnlock()

	if f, ok := s.data.CatalogFrames[strings.ToUpper(key)]; ok {
		cp := cloneCatalogFrame(f)
		return &cp, nil
	}
	for _, f := range s.data.CatalogFrames {
		if strings.EqualFold(f.SKU, key) || strings.EqualFold(f.ID, key) {
			cp := cloneCatalogFrame(f)
			return &cp, nil
		}
	}
	return nil, ErrFrameNotFound
}

func (s *Store) normalizeFrameInputLocked(in CatalogFrame, existing *CatalogFrame, now time.Time) (CatalogFrame, error) {
	sku := strings.ToUpper(strings.TrimSpace(in.SKU))
	if sku == "" && existing != nil {
		sku = existing.SKU
	}
	name := strings.TrimSpace(in.Name)
	if name == "" && existing != nil {
		name = existing.Name
	}
	width := in.FrameWidthMM
	if width <= 0 && existing != nil {
		width = existing.FrameWidthMM
	}
	if sku == "" || name == "" || width <= 0 {
		return CatalogFrame{}, ErrInvalidCatalogFrame
	}

	out := CatalogFrame{
		SKU:          sku,
		Name:         name,
		FrameWidthMM: width,
		UpdatedAt:    now,
	}
	if existing != nil {
		out.ID = existing.ID
		out.CreatedAt = existing.CreatedAt
		out.SortOrder = existing.SortOrder
		out.BridgeMM = existing.BridgeMM
		out.TempleMM = existing.TempleMM
		out.FrameStyle = existing.FrameStyle
		out.FaceShapes = existing.FaceShapes
		out.Color = existing.Color
		out.Material = existing.Material
		out.PriceIDR = existing.PriceIDR
		out.ThumbnailURL = existing.ThumbnailURL
		out.TryOnAssetURL = existing.TryOnAssetURL
		out.TryOnSprites = existing.TryOnSprites
		out.TryOnConfig = existing.TryOnConfig
		out.StockStatus = existing.StockStatus
		out.IsActive = existing.IsActive
	} else {
		out.CreatedAt = now
		out.IsActive = true
		out.SortOrder = len(s.data.CatalogFrames) + 1
	}

	if strings.TrimSpace(in.ID) != "" {
		out.ID = strings.TrimSpace(in.ID)
	} else if out.ID == "" {
		out.ID = strings.ToLower(sku)
	}

	if in.BridgeMM > 0 {
		out.BridgeMM = in.BridgeMM
	} else if out.BridgeMM <= 0 {
		out.BridgeMM = 18
	}

	if in.TempleMM > 0 {
		out.TempleMM = in.TempleMM
	} else if out.TempleMM <= 0 {
		out.TempleMM = 142
	}

	cat := normalizeSizeCategoryCode(in.SizeCategory)
	if isValidSizeCategoryCode(cat) {
		out.SizeCategory = cat
	} else {
		out.SizeCategory = s.MatchSizeCategoryLocked(width).Category
	}

	if strings.TrimSpace(in.FrameStyle) != "" {
		out.FrameStyle = strings.ToLower(strings.TrimSpace(in.FrameStyle))
	} else if out.FrameStyle == "" {
		out.FrameStyle = "rectangle"
	}

	if in.FaceShapes != nil {
		cleanedShapes := make([]string, 0, len(in.FaceShapes))
		for _, fs := range in.FaceShapes {
			trimmed := strings.ToLower(strings.TrimSpace(fs))
			if trimmed != "" {
				cleanedShapes = append(cleanedShapes, trimmed)
			}
		}
		out.FaceShapes = cleanedShapes
	} else if out.FaceShapes == nil {
		out.FaceShapes = []string{"oval", "round"}
	}

	if strings.TrimSpace(in.Color) != "" {
		out.Color = strings.TrimSpace(in.Color)
	} else if out.Color == "" {
		out.Color = "Black"
	}

	if strings.TrimSpace(in.Material) != "" {
		out.Material = strings.TrimSpace(in.Material)
	} else if out.Material == "" {
		out.Material = "Acetate"
	}

	if in.PriceIDR > 0 {
		out.PriceIDR = in.PriceIDR
	} else if out.PriceIDR <= 0 {
		out.PriceIDR = 299000
	}

	if strings.TrimSpace(in.ThumbnailURL) != "" {
		out.ThumbnailURL = strings.TrimSpace(in.ThumbnailURL)
	} else if out.ThumbnailURL == "" {
		out.ThumbnailURL = "/images/1.png"
	}

	if strings.TrimSpace(in.TryOnAssetURL) != "" {
		out.TryOnAssetURL = strings.TrimSpace(in.TryOnAssetURL)
	} else if out.TryOnAssetURL == "" {
		out.TryOnAssetURL = out.ThumbnailURL
	}

	if in.TryOnSprites != nil {
		out.TryOnSprites = in.TryOnSprites
	}

	if in.TryOnConfig.WidthMultiplier > 0 {
		out.TryOnConfig = in.TryOnConfig
	} else if out.TryOnConfig.WidthMultiplier <= 0 {
		out.TryOnConfig = TryOnRenderConfig{
			WidthMultiplier: 1.38,
			VerticalOffset:  0.016,
			BridgeOffset:    0,
		}
	}

	stock := strings.ToLower(strings.TrimSpace(in.StockStatus))
	if stock != "" {
		if !isValidStockStatus(stock) {
			return CatalogFrame{}, fmt.Errorf("%w: invalid stock_status %q", ErrInvalidCatalogFrame, in.StockStatus)
		}
		out.StockStatus = stock
	} else if out.StockStatus == "" {
		out.StockStatus = StockInStock
	}

	if in.SortOrder > 0 {
		out.SortOrder = in.SortOrder
	}
	return out, nil
}

// UpsertCatalogFrame creates or updates a frame SKU in the catalog (Owner/Admin only) and logs an AuditLog.
func (s *Store) UpsertCatalogFrame(in CatalogFrame, isActiveOverride *bool, actorUserID, role, outletID string, now time.Time) (*CatalogFrame, bool, error) {
	if role != RoleOwner && role != RoleAdmin {
		return nil, false, ErrUnauthorizedRole
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	skuKey := strings.ToUpper(strings.TrimSpace(in.SKU))
	existing := s.data.CatalogFrames[skuKey]
	created := existing == nil

	normalized, err := s.normalizeFrameInputLocked(in, existing, now)
	if err != nil {
		return nil, false, err
	}
	if isActiveOverride != nil {
		normalized.IsActive = *isActiveOverride
	}

	s.data.CatalogFrames[normalized.SKU] = &normalized

	action := "catalog_update_frame"
	if created {
		action = "catalog_create_frame"
	}
	s.appendAuditLogLocked(
		actorUserID,
		role,
		outletID,
		"catalog:frame:"+normalized.SKU,
		action,
		AuditAdminCatalog,
		fmt.Sprintf("%s SKU=%s (%s, %.0fmm, size=%s, stock=%s)", action, normalized.SKU, normalized.Name, normalized.FrameWidthMM, normalized.SizeCategory, normalized.StockStatus),
		now,
	)
	_ = s.persistLocked()

	cp := cloneCatalogFrame(&normalized)
	return &cp, created, nil
}

// DeleteCatalogFrame deletes or soft-deactivates a frame SKU (Owner/Admin only) and logs an AuditLog.
func (s *Store) DeleteCatalogFrame(sku string, softDeactivate bool, actorUserID, role, outletID string, now time.Time) error {
	if role != RoleOwner && role != RoleAdmin {
		return ErrUnauthorizedRole
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	key := strings.ToUpper(strings.TrimSpace(sku))

	s.mu.Lock()
	defer s.mu.Unlock()

	existing, ok := s.data.CatalogFrames[key]
	if !ok {
		return ErrFrameNotFound
	}

	if softDeactivate {
		existing.IsActive = false
		existing.UpdatedAt = now
	} else {
		delete(s.data.CatalogFrames, key)
	}

	s.appendAuditLogLocked(
		actorUserID,
		role,
		outletID,
		"catalog:frame:"+key,
		"catalog_delete_frame",
		AuditAdminCatalog,
		fmt.Sprintf("Deleted frame SKU=%s (soft=%v)", key, softDeactivate),
		now,
	)
	_ = s.persistLocked()
	return nil
}

// ImportCatalog bulk imports/upserts size chart and/or frames (Owner/Admin only) and logs an AuditLog.
func (s *Store) ImportCatalog(in CatalogImportPayload, actorUserID, role, outletID string, now time.Time) (int, int, error) {
	if role != RoleOwner && role != RoleAdmin {
		return 0, 0, ErrUnauthorizedRole
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	var normalizedChart []SizeChartEntry
	var err error
	if len(in.SizeChart) > 0 {
		normalizedChart, err = ValidateAndNormalizeSizeChart(in.SizeChart, now)
		if err != nil {
			return 0, 0, err
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	chartCount := 0
	if len(normalizedChart) > 0 {
		s.data.SizeChart = normalizedChart
		chartCount = len(normalizedChart)
	}

	if in.ReplaceAll && len(in.Frames) > 0 {
		s.data.CatalogFrames = make(map[string]*CatalogFrame)
	}

	frameCount := 0
	for _, item := range in.Frames {
		skuKey := strings.ToUpper(strings.TrimSpace(item.SKU))
		existing := s.data.CatalogFrames[skuKey]
		normFrame, err := s.normalizeFrameInputLocked(item, existing, now)
		if err != nil {
			return 0, 0, err
		}
		normFrame.IsActive = true
		s.data.CatalogFrames[normFrame.SKU] = &normFrame
		frameCount++
	}

	s.appendAuditLogLocked(
		actorUserID,
		role,
		outletID,
		"catalog:bulk-import",
		"catalog_bulk_import",
		AuditAdminCatalog,
		fmt.Sprintf("Imported %d size chart entries and %d frames (replace_all=%v)", chartCount, frameCount, in.ReplaceAll),
		now,
	)
	_ = s.persistLocked()
	return chartCount, frameCount, nil
}

func matchesIfNoneMatch(headerVal, etag string) bool {
	if strings.TrimSpace(headerVal) == "" || etag == "" {
		return false
	}
	for _, part := range strings.Split(headerVal, ",") {
		candidate := strings.TrimSpace(part)
		candidate = strings.TrimPrefix(candidate, "W/")
		if candidate == "*" || candidate == etag {
			return true
		}
	}
	return false
}

// handleCatalogSizeChart handles GET /api/catalog/size-chart
func (s *Server) handleCatalogSizeChart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	chart, updatedAt, etag := s.cfg.Store.GetSizeChart()
	widthQuery := strings.TrimSpace(r.URL.Query().Get("width_mm"))
	if widthQuery != "" {
		etag = strings.TrimSuffix(etag, `"`) + `-w` + widthQuery + `"`
	}

	w.Header().Set("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
	w.Header().Set("ETag", etag)

	if matchesIfNoneMatch(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	resp := map[string]any{
		"ok":         true,
		"version":    "2026.11-dooz-ssot",
		"updated_at": updatedAt,
		"size_chart": chart,
	}

	if widthQuery != "" {
		if wMM, err := strconv.ParseFloat(widthQuery, 64); err == nil && wMM > 0 {
			matched := s.cfg.Store.MatchSizeCategory(wMM)
			resp["query_width_mm"] = wMM
			resp["matched_category"] = matched
		}
	}

	writeJSON(w, http.StatusOK, resp)
}

// handleCatalogFrames handles GET /api/catalog/frames and GET /api/catalog/frames/{sku}
func (s *Server) handleCatalogFrames(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	subPath := strings.TrimPrefix(r.URL.Path, "/api/catalog/frames")
	subPath = strings.Trim(subPath, "/")
	if subPath != "" {
		frame, err := s.cfg.Store.GetCatalogFrameBySKU(subPath)
		if err != nil {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		raw, _ := json.Marshal(frame)
		sum := sha256.Sum256(raw)
		etag := fmt.Sprintf(`"dooz-sku-%s"`, hex.EncodeToString(sum[:8]))
		w.Header().Set("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
		w.Header().Set("ETag", etag)
		if matchesIfNoneMatch(r.Header.Get("If-None-Match"), etag) {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":    true,
			"frame": frame,
		})
		return
	}

	q := r.URL.Query()
	var widthMM float64
	if wStr := strings.TrimSpace(q.Get("width_mm")); wStr != "" {
		if parsed, err := strconv.ParseFloat(wStr, 64); err == nil && parsed > 0 {
			widthMM = parsed
		}
	}

	filter := CatalogFilter{
		Size:            strings.TrimSpace(q.Get("size")),
		WidthMM:         widthMM,
		IncludeAdjacent: q.Get("include_adjacent") == "true" || q.Get("include_adjacent") == "1",
		FaceShape:       strings.TrimSpace(q.Get("face_shape")),
		StockStatus:     strings.TrimSpace(q.Get("stock")),
		InStockOnly:     q.Get("in_stock_only") == "true" || q.Get("in_stock_only") == "1",
		FrameStyle:      strings.TrimSpace(q.Get("style")),
		Query:           strings.TrimSpace(q.Get("q")),
		IncludeInactive: q.Get("include_inactive") == "true" || q.Get("include_inactive") == "1",
	}

	frames, etag := s.cfg.Store.ListCatalogFrames(filter)
	w.Header().Set("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
	w.Header().Set("ETag", etag)

	if matchesIfNoneMatch(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	resp := map[string]any{
		"ok":      true,
		"total":   len(frames),
		"filters": filter,
		"frames":  frames,
	}
	if widthMM > 0 {
		resp["recommended_size"] = s.cfg.Store.MatchSizeCategory(widthMM)
	}
	writeJSON(w, http.StatusOK, resp)
}

// handleAdminCatalogSizeChart handles PUT /api/admin/catalog/size-chart (and GET for admin view)
func (s *Server) handleAdminCatalogSizeChart(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		s.handleCatalogSizeChart(w, r)
		return
	}
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	actorID, role, outletID := extractStaffContext(r)
	if role != RoleOwner && role != RoleAdmin {
		writeError(w, http.StatusForbidden, ErrUnauthorizedRole.Error())
		return
	}

	var rawBody json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&rawBody); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}

	var entries []SizeChartEntry
	recalc := true

	var wrapper struct {
		SizeChart         []SizeChartEntry `json:"size_chart"`
		RecalculateFrames *bool            `json:"recalculate_frames"`
	}
	if err := json.Unmarshal(rawBody, &wrapper); err == nil && len(wrapper.SizeChart) > 0 {
		entries = wrapper.SizeChart
		if wrapper.RecalculateFrames != nil {
			recalc = *wrapper.RecalculateFrames
		}
	} else if err := json.Unmarshal(rawBody, &entries); err != nil {
		writeError(w, http.StatusBadRequest, "invalid size_chart JSON structure")
		return
	}

	updated, err := s.cfg.Store.UpdateSizeChart(entries, recalc, actorID, role, outletID, s.cfg.Clock())
	if err != nil {
		writeStaffError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"size_chart": updated,
	})
}

type adminFramePayload struct {
	CatalogFrame
	IsActive *bool `json:"is_active,omitempty"`
}

// handleAdminCatalogFrames handles GET and POST /api/admin/catalog/frames
func (s *Server) handleAdminCatalogFrames(w http.ResponseWriter, r *http.Request) {
	actorID, role, outletID := extractStaffContext(r)
	if role != RoleOwner && role != RoleAdmin {
		writeError(w, http.StatusForbidden, ErrUnauthorizedRole.Error())
		return
	}

	if r.Method == http.MethodGet {
		frames, _ := s.cfg.Store.ListCatalogFrames(CatalogFilter{IncludeInactive: true})
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":     true,
			"total":  len(frames),
			"frames": frames,
		})
		return
	}

	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req adminFramePayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}

	frame, created, err := s.cfg.Store.UpsertCatalogFrame(req.CatalogFrame, req.IsActive, actorID, role, outletID, s.cfg.Clock())
	if err != nil {
		writeStaffError(w, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	writeJSON(w, status, map[string]any{
		"ok":      true,
		"created": created,
		"frame":   frame,
	})
}

// handleAdminCatalogFrameBySKU handles GET, PUT, and DELETE /api/admin/catalog/frames/{sku}
func (s *Server) handleAdminCatalogFrameBySKU(w http.ResponseWriter, r *http.Request) {
	actorID, role, outletID := extractStaffContext(r)
	if role != RoleOwner && role != RoleAdmin {
		writeError(w, http.StatusForbidden, ErrUnauthorizedRole.Error())
		return
	}

	sku := strings.TrimPrefix(r.URL.Path, "/api/admin/catalog/frames/")
	sku = strings.Trim(sku, "/")
	if sku == "" {
		writeError(w, http.StatusBadRequest, "missing frame SKU in path")
		return
	}

	switch r.Method {
	case http.MethodGet:
		frame, err := s.cfg.Store.GetCatalogFrameBySKU(sku)
		if err != nil {
			writeStaffError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "frame": frame})

	case http.MethodPut:
		existing, err := s.cfg.Store.GetCatalogFrameBySKU(sku)
		if err != nil {
			writeStaffError(w, err)
			return
		}
		var req adminFramePayload
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON payload")
			return
		}
		req.CatalogFrame.SKU = existing.SKU
		frame, _, err := s.cfg.Store.UpsertCatalogFrame(req.CatalogFrame, req.IsActive, actorID, role, outletID, s.cfg.Clock())
		if err != nil {
			writeStaffError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "frame": frame})

	case http.MethodDelete:
		soft := r.URL.Query().Get("soft") == "true" || r.URL.Query().Get("soft") == "1"
		if err := s.cfg.Store.DeleteCatalogFrame(sku, soft, actorID, role, outletID, s.cfg.Clock()); err != nil {
			writeStaffError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":      true,
			"deleted": strings.ToUpper(sku),
			"soft":    soft,
		})

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// handleAdminCatalogImport handles POST /api/admin/catalog/import
func (s *Server) handleAdminCatalogImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	actorID, role, outletID := extractStaffContext(r)
	if role != RoleOwner && role != RoleAdmin {
		writeError(w, http.StatusForbidden, ErrUnauthorizedRole.Error())
		return
	}

	var req CatalogImportPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}

	chartCount, frameCount, err := s.cfg.Store.ImportCatalog(req, actorID, role, outletID, s.cfg.Clock())
	if err != nil {
		writeStaffError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":                   true,
		"imported_size_ranges": chartCount,
		"imported_frames":      frameCount,
	})
}
