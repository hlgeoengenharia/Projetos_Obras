// Test logic of child partitioning
const maxH = 500;

// Simulate 30 lines
const lines = [];
for (let i = 1; i <= 35; i++) {
    lines.push({ id: i, text: `Line ${i}`, height: 20 });
}

// Partitioning
let currentH = 0;
const page1 = [];
const page2 = [];

for (const line of lines) {
    if (currentH + line.height <= maxH) {
        page1.push(line);
        currentH += line.height;
    } else {
        page2.push(line);
    }
}

console.log('Page 1 items:', page1.length, 'Total H:', currentH);
console.log('Page 2 items:', page2.length);
