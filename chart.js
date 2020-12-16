function makeChart() {
    var margin = {
            top: 10,
            right: 10,
            bottom: 30,
            left: 50
        },
        width = 1000 - margin.left - margin.right,
        height = 800 - margin.top - margin.bottom;

    var svg = d3.select("#covid-tracking")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    d3.json("summary.json")
        .then(function(data) {
            var tp = d3.timeParse("%Y-%m-%d");

            data = data.filter(d => +d.diff > 0);
            data.forEach(d => d.day = tp(d.day));

            var x = d3.scaleTime()
                .domain(d3.extent(data, d => d.day))
                .range([0, width]);
            svg.append("g")
                .attr("transform", "translate(0," + height + ")")
                .call(d3.axisBottom(x));

            var y = d3.scaleLinear()
                .domain([
                    0,
                    d3.max(data, d => +d.diff)
                ])
                .range([
                    height,
                    0
                ]);
            svg.append("g")
                .call(d3.axisLeft(y));

            var diffs = d3.nest()
                .key(d => d.sub_province)
                .entries(data);
            var keys = diffs.map(d => d.key);
            var color = d3.scaleOrdinal()
                .domain(keys)
                .range(d3.schemeSet2);

            svg.selectAll(".line")
                .data(diffs)
                .enter()
                .append("path")
                .attr("fill", "none")
                .attr("stroke", d => color(d.key))
                .attr("stroke-width", 1)
                .attr("d", function(d) {
                    return d3.line()
                        .curve(d3.curveBasis)
                        .x(d => x(d.day))
                        .y(d => y(+d.diff))
                        (d.values);
                });

            var sdas = d3.nest()
                .key(d => d.sub_province)
                .entries(data.filter(d => typeof d.seven_day_average !== "undefined"));
            var sdaColor = d3.scaleOrdinal()
                .domain(keys)
                .range(d3.schemeSet2);

            svg.selectAll(".line")
                .data(sdas)
                .enter()
                .append("path")
                .attr("fill", "none")
                .attr("stroke", d => sdaColor(d.key))
                .attr("stroke-width", 3)
                .attr("d", function(d) {
                    return d3.line()
                        .curve(d3.curveBasis)
                        .x(d => x(d.day))
                        .y(d => y(+d.seven_day_average))
                        (d.values);
                });

            var size = 14;
            var offset = 70;
            svg.selectAll("legend-dots")
                .data(keys)
                .enter()
                .append("rect")
                .attr("x", offset)
                .attr("y", (_, i) => offset + i * (size + 5))
                .attr("width", size)
                .attr("height", size)
                .style("fill", d => color(d));

            svg.selectAll("legend-labels")
                .data(keys)
                .enter()
                .append("text")
                .attr("x", offset + 3 + (size * 1.2))
                .attr("y", (_, i) => offset + 2 + i * (size + 5) + (size / 2))
                .style("fill", d => color(d))
                .text(d => d.replaceAll(/^\*\*|\*\*$/g, ""))
                .attr("text-anchor", "left")
                .style("alignment-baseline", "middle");
        });
}
