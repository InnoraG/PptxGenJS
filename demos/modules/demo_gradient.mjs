/**
 * NAME: demo_gradient.mjs
 * AUTH: PptxGenJS Contributors
 * DESC: Comprehensive gradient fill demonstrations 
 * VER.: 4.0.1
 */

import { BASE_TABLE_OPTS, BASE_TEXT_OPTS_L, BASE_TEXT_OPTS_R } from "./enums.mjs";

export function genSlides_Gradient(pptx) {
    pptx.addSection({ title: "Gradients" });

    // Define slide master with gradient background
    pptx.defineSlideMaster({
        title: "GRADIENT_MASTER",
        background: {
            type: "gradient",
            gradientDirection: "circle",
            gradientStops: [
                { position: 0, color: "FFFFFF" },
                { position: 40, color: "00A8E8" },
                { position: 100, color: "00171F" }
            ],
            fillToRect: { l: 50, t: 50, r: 50, b: 50 }
        }
    });

    genSlide01_LinearGradients(pptx);
    genSlide02_PathGradients(pptx);
    genSlide03_MultiStopGradients(pptx);
    genSlide04_SlideBackgroundGradient(pptx);
    genSlide05_SlideMasterGradient(pptx);
    genSlide06_VariousShapesWithGradients(pptx);
}

function genSlide01_LinearGradients(pptx) {
    let slide = pptx.addSlide({ sectionTitle: "Gradients" });
    slide.addTable([[{ text: "Gradient Demo 1: Linear Gradients", options: BASE_TEXT_OPTS_L }, BASE_TEXT_OPTS_R]], BASE_TABLE_OPTS);

    const gradients = [
        { angle: 0, label: "0° L→R", colors: ["FF0000", "0000FF"] },
        { angle: 45, label: "45°", colors: ["00FF00", "FF00FF"] },
        { angle: 90, label: "90° T→B", colors: ["FFFF00", "00FFFF"] },
        { angle: 135, label: "135°", colors: ["FF6600", "0066FF"] },
        { angle: 180, label: "180° R→L", colors: ["FF0066", "66FF00"] },
        { angle: 270, label: "270° B→T", colors: ["6600FF", "FF6600"] },
    ];

    gradients.forEach((grad, idx) => {
        slide.addText(grad.label, {
            shape: pptx.shapes.RECTANGLE,
            x: 0.5 + (idx % 3) * 4.3,
            y: 0.8 + Math.floor(idx / 3) * 3.3,
            w: 3.8,
            h: 2.8,
            fill: {
                type: "gradient",
                gradientDirection: "linear",
                gradientAngle: grad.angle,
                gradientStops: [
                    { position: 0, color: grad.colors[0] },
                    { position: 100, color: grad.colors[1] },
                ],
            },
            align: "center",
            valign: "middle",
            fontSize: 16,
            color: "FFFFFF",
            bold: true,
        });
    });
}

function genSlide02_PathGradients(pptx) {
    let slide = pptx.addSlide({ sectionTitle: "Gradients" });
    slide.addTable([[{ text: "Gradient Demo 2: Path Gradients", options: BASE_TEXT_OPTS_L }, BASE_TEXT_OPTS_R]], BASE_TABLE_OPTS);

    slide.addText("Circle\n(Centered)", {
        shape: pptx.shapes.OVAL,
        x: 0.5, y: 0.8, w: 3.5, h: 3.0,
        fill: {
            type: "gradient",
            gradientDirection: "circle",
            gradientStops: [
                { position: 0, color: "FFFFFF" },
                { position: 100, color: "0066CC" },
            ],
            fillToRect: { l: 50, t: 50, r: 50, b: 50 },
        },
        align: "center", valign: "middle", fontSize: 14, color: "333333", bold: true,
    });

    slide.addText("Circle\n(Off-Center)", {
        shape: pptx.shapes.OVAL,
        x: 4.5, y: 0.8, w: 3.5, h: 3.0,
        fill: {
            type: "gradient",
            gradientDirection: "circle",
            gradientStops: [
                { position: 0, color: "FFFF99" },
                { position: 100, color: "FF6600" },
            ],
            fillToRect: { l: 20, t: 20, r: 80, b: 80 },
        },
        align: "center", valign: "middle", fontSize: 14, color: "333333", bold: true,
    });

    slide.addText("Rect Gradient", {
        shape: pptx.shapes.RECTANGLE,
        x: 8.5, y: 0.8, w: 3.5, h: 3.0,
        fill: {
            type: "gradient",
            gradientDirection: "rect",
            gradientStops: [
                { position: 0, color: "FFFFFF" },
                { position: 100, color: "CC3300" },
            ],
            fillToRect: { l: 50, t: 50, r: 50, b: 50 },
        },
        align: "center", valign: "middle", fontSize: 14, color: "333333", bold: true,
    });

    slide.addText("Shape\nGradient", {
        shape: pptx.shapes.HEXAGON,
        x: 0.5, y: 4.2, w: 3.5, h: 2.8,
        fill: {
            type: "gradient",
            gradientDirection: "shape",
            gradientStops: [
                { position: 0, color: "FFFFFF" },
                { position: 100, color: "009933" },
            ],
        },
        align: "center", valign: "middle", fontSize: 14, color: "333333", bold: true,
    });

    slide.addText("With\nTransparency", {
        shape: pptx.shapes.ROUNDED_RECTANGLE,
        x: 4.5, y: 4.2, w: 3.5, h: 2.8,
        fill: {
            type: "gradient",
            gradientDirection: "circle",
            gradientStops: [
                { position: 0, color: "FFFFFF", transparency: 0 },
                { position: 100, color: "9900CC", transparency: 50 },
            ],
            fillToRect: { l: 50, t: 50, r: 50, b: 50 },
        },
        align: "center", valign: "middle", fontSize: 14, color: "333333", bold: true,
        rectRadius: 0.2,
    });

    slide.addShape(pptx.shapes.HEART, {
        x: 8.5, y: 4.2, w: 3.5, h: 2.8,
        fill: {
            type: "gradient",
            gradientDirection: "circle",
            gradientStops: [
                { position: 0, color: "FFCCCC" },
                { position: 100, color: "CC0033" },
            ],
            fillToRect: { l: 50, t: 30, r: 50, b: 70 },
        },
    });
}

function genSlide03_MultiStopGradients(pptx) {
    let slide = pptx.addSlide({ sectionTitle: "Gradients" });
    slide.addTable([[{ text: "Gradient Demo 3: Multi-Stop Gradients", options: BASE_TEXT_OPTS_L }, BASE_TEXT_OPTS_R]], BASE_TABLE_OPTS);

    slide.addText("3 Stops", {
        shape: pptx.shapes.RECTANGLE,
        x: 0.5, y: 0.8, w: 12, h: 1.5,
        fill: {
            type: "gradient",
            gradientDirection: "linear",
            gradientAngle: 0,
            gradientStops: [
                { position: 0, color: "FF0000" },
                { position: 50, color: "00FF00" },
                { position: 100, color: "0000FF" },
            ],
        },
        align: "center", valign: "middle", fontSize: 20, color: "FFFFFF", bold: true,
    });

    slide.addText("5 Stops (Rainbow)", {
        shape: pptx.shapes.RECTANGLE,
        x: 0.5, y: 2.5, w: 12, h: 1.5,
        fill: {
            type: "gradient",
            gradientDirection: "linear",
            gradientAngle: 0,
            gradientStops: [
                { position: 0, color: "FF0000" },
                { position: 25, color: "FFFF00" },
                { position: 50, color: "00FF00" },
                { position: 75, color: "00FFFF" },
                { position: 100, color: "0000FF" },
            ],
        },
        align: "center", valign: "middle", fontSize: 20, color: "333333", bold: true,
    });

    slide.addText("Transparency\nStops", {
        shape: pptx.shapes.RECTANGLE,
        x: 0.5, y: 4.2, w: 5.5, h: 2.5,
        fill: {
            type: "gradient",
            gradientDirection: "linear",
            gradientAngle: 90,
            gradientStops: [
                { position: 0, color: "0066CC", transparency: 0 },
                { position: 50, color: "0066CC", transparency: 50 },
                { position: 100, color: "0066CC", transparency: 90 },
            ],
        },
        align: "center", valign: "middle", fontSize: 16, color: "FFFFFF", bold: true,
    });

    slide.addText("4 Stops\n(Sunset)", {
        shape: pptx.shapes.ROUNDED_RECTANGLE,
        x: 6.5, y: 4.2, w: 5.5, h: 2.5,
        fill: {
            type: "gradient",
            gradientDirection: "linear",
            gradientAngle: 180,
            gradientStops: [
                { position: 0, color: "FFE066" },
                { position: 33, color: "FF8C42" },
                { position: 66, color: "FF6B35" },
                { position: 100, color: "4A0E4E" },
            ],
        },
        align: "center", valign: "middle", fontSize: 18, color: "FFFFFF", bold: true,
        rectRadius: 0.3,
    });
}

function genSlide04_SlideBackgroundGradient(pptx) {
    let slide = pptx.addSlide({ sectionTitle: "Gradients" });

    slide.background = {
        type: "gradient",
        gradientDirection: "linear",
        gradientAngle: 135,
        gradientStops: [
            { position: 0, color: "1a1a2e" },
            { position: 50, color: "16213e" },
            { position: 100, color: "0f3460" },
        ],
    };

    slide.addTable([[{ text: "Gradient Demo 4: Slide Background Gradient", options: { ...BASE_TEXT_OPTS_L, color: "FFFFFF" } }, { ...BASE_TEXT_OPTS_R, color: "FFFFFF" }]], {
        ...BASE_TABLE_OPTS,
        fill: { type: "solid", color: "000000", transparency: 50 },
    });

    slide.addText("This slide has a\ngradient background!", {
        x: 1, y: 2, w: 11, h: 1.5,
        align: "center", fontSize: 32, color: "FFFFFF", bold: true,
    });

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: 2, y: 4.5, w: 3, h: 1.5,
        fill: { type: "solid", color: "FFFFFF", transparency: 20 },
        line: { color: "FFFFFF", width: 2 },
        rectRadius: 0.3,
    });

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: 5.5, y: 4.5, w: 3, h: 1.5,
        fill: {
            type: "gradient",
            gradientDirection: "linear",
            gradientAngle: 90,
            gradientStops: [
                { position: 0, color: "FF6B6B" },
                { position: 100, color: "4ECDC4" },
            ],
        },
        rectRadius: 0.3,
    });

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: 9, y: 4.5, w: 3, h: 1.5,
        fill: {
            type: "gradient",
            gradientDirection: "circle",
            gradientStops: [
                { position: 0, color: "FFFFFF" },
                { position: 100, color: "667eea" },
            ],
            fillToRect: { l: 50, t: 50, r: 50, b: 50 },
        },
        rectRadius: 0.3,
    });
}

function genSlide05_SlideMasterGradient(pptx) {
    let slide = pptx.addSlide({ masterName: "GRADIENT_MASTER", sectionTitle: "Gradients" });

    slide.addText("This slide uses a\nSlide Master with\ngradient background!", {
        x: 1, y: 1.5, w: 11, h: 2,
        align: "center", valign: "middle", fontSize: 36, color: "FFFFFF", bold: true,
    });

    slide.addShape(pptx.shapes.STAR_5_POINT, {
        x: 2, y: 5, w: 2, h: 2,
        fill: {
            type: "gradient",
            gradientDirection: "circle",
            gradientStops: [
                { position: 0, color: "FFD700" },
                { position: 100, color: "FF8C00" },
            ],
            fillToRect: { l: 50, t: 50, r: 50, b: 50 },
        },
        line: { type: "none" },
    });

    slide.addShape(pptx.shapes.STAR_5_POINT, {
        x: 5.5, y: 5, w: 2, h: 2,
        fill: {
            type: "gradient",
            gradientDirection: "circle",
            gradientStops: [
                { position: 0, color: "FFD700" },
                { position: 100, color: "FF8C00" },
            ],
            fillToRect: { l: 50, t: 50, r: 50, b: 50 },
        },
        line: { type: "none" },
    });

    slide.addShape(pptx.shapes.STAR_5_POINT, {
        x: 9, y: 5, w: 2, h: 2,
        fill: {
            type: "gradient",
            gradientDirection: "circle",
            gradientStops: [
                { position: 0, color: "FFD700" },
                { position: 100, color: "FF8C00" },
            ],
            fillToRect: { l: 50, t: 50, r: 50, b: 50 },
        },
        line: { type: "none" },
    });
}

function genSlide06_VariousShapesWithGradients(pptx) {
    let slide = pptx.addSlide({ sectionTitle: "Gradients" });
    slide.addTable([[{ text: "Gradient Demo 6: Various Shapes", options: BASE_TEXT_OPTS_L }, BASE_TEXT_OPTS_R]], BASE_TABLE_OPTS);

    // Check if shapes might be undefined, fallback to RECTANGLE if so
    const getShape = (name) => pptx.shapes[name] || pptx.shapes.RECTANGLE;

    const shapes = [
        { name: "Triangle", shape: getShape("TRIANGLE"), x: 0.5, y: 1, angle: 0 },
        { name: "Diamond", shape: getShape("DIAMOND"), x: 3, y: 1, angle: 45 },
        { name: "Pentagon", shape: getShape("PENTAGON"), x: 5.5, y: 1, angle: 90 },
        { name: "Octagon", shape: getShape("OCTAGON"), x: 8, y: 1, angle: 135 },
        { name: "Trapezoid", shape: getShape("TRAPEZOID"), x: 10.5, y: 1, angle: 180 },
        { name: "Cloud", shape: getShape("CLOUD"), x: 0.5, y: 3.5, angle: 270 },
        { name: "Lightning", shape: getShape("LIGHTNING_BOLT"), x: 3, y: 3.5, angle: 315 },
        { name: "Moon", shape: getShape("MOON"), x: 5.5, y: 3.5, angle: 0 },
        { name: "Sun", shape: getShape("SUN"), x: 8, y: 3.5, angle: 90 },
        { name: "Smiley", shape: getShape("SMILEY_FACE"), x: 10.5, y: 3.5, angle: 45 },
    ];

    const colors = [
        ["FF6B6B", "4ECDC4"],
        ["A8E6CF", "FFD3B6"],
        ["FFAAA5", "FF8B94"],
        ["B4F8C8", "A0E7E5"],
        ["FBE7C6", "B4A7D6"],
    ];

    shapes.forEach((shapeInfo, idx) => {
        const colorPair = colors[idx % colors.length];

        slide.addShape(shapeInfo.shape, {
            x: shapeInfo.x, y: shapeInfo.y, w: 2, h: 2,
            fill: {
                type: "gradient",
                gradientDirection: "linear",
                gradientAngle: shapeInfo.angle,
                gradientStops: [
                    { position: 0, color: colorPair[0] },
                    { position: 100, color: colorPair[1] },
                ],
            },
            line: { color: "666666", width: 1 },
        });

        slide.addText(shapeInfo.name, {
            x: shapeInfo.x, y: shapeInfo.y + 2.2, w: 2, h: 0.3,
            fontSize: 10, align: "center", color: "333333",
        });
    });
}
