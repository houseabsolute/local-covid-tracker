function makeChart() {
    var margin = {
            top: 10,
            right: 30,
            bottom: 30,
            left: 50,
        },
        width = 1000 - margin.left - margin.right,
        height = 800 - margin.top - margin.bottom;

    var svg = d3
        .select("#covid-tracking")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    d3.json("summary.json").then((data) => {
        var tp = d3.utcParse("%Y-%m-%d");
        var keyF = d3.utcFormat("%Y-%m-%d");

        var byDay = {};
        data = data.filter((d) => +d.diff > 0);
        data.forEach((d) => {
            d.day = tp(d.day);
            d.sub_province = d.sub_province.replaceAll(/^\*\*|\*\*$/g, "");
            var key = keyF(d.day);
            if (typeof byDay[key] === "undefined") {
                byDay[key] = {};
            }
            byDay[key][d.sub_province] = d;
        });

        var firstDay = byDay[Object.keys(byDay).sort()[0]];

        var x = d3
            .scaleTime()
            .domain(d3.extent(data, (d) => d.day))
            .range([0, width]);
        svg.append("g")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(x));

        var y = d3
            .scaleLinear()
            .domain([0, d3.max(data, (d) => +d.diff)])
            .range([height, 0]);
        svg.append("g").call(d3.axisLeft(y));

        var diffs = d3
            .nest()
            .key((d) => d.sub_province)
            .entries(data);
        var keys = diffs.map((d) => d.key);
        var color = d3.scaleOrdinal().domain(keys).range(d3.schemeSet2);

        svg.selectAll(".line")
            .data(diffs)
            .enter()
            .append("path")
            .attr("fill", "none")
            .attr("stroke", (d) => color(d.key))
            .attr("stroke-width", 1)
            .attr("d", (d) =>
                d3
                    .line()
                    .curve(d3.curveBasis)
                    .x((d) => x(d.day))
                    .y((d) => y(+d.diff))(d.values)
            );

        var sdas = d3
            .nest()
            .key((d) => d.sub_province)
            .entries(data.filter((d) => typeof d.seven_day_average !== "undefined"));
        var sdaColor = d3.scaleOrdinal().domain(keys).range(d3.schemeSet2);

        svg.selectAll(".line")
            .data(sdas)
            .enter()
            .append("path")
            .attr("class", "line")
            .attr("fill", "none")
            .attr("stroke", (d) => sdaColor(d.key))
            .attr("stroke-width", 3)
            .attr("d", (d) =>
                d3
                    .line()
                    .curve(d3.curveBasis)
                    .x((d) => x(d.day))
                    .y((d) => y(+d.seven_day_average))(d.values)
            );

        var size = 14;
        var xOffset = 70;

        svg.selectAll("legend-dots")
            .data(keys)
            .enter()
            .append("rect")
            .attr("x", xOffset)
            .attr("y", (_, i) => xOffset + i * (size + 5))
            .attr("width", size)
            .attr("height", size)
            .style("fill", (d) => color(d));

        svg.selectAll("legend-labels")
            .data(keys)
            .enter()
            .append("text")
            .attr("x", xOffset + 3 + size * 1.2)
            .attr("y", (_, i) => xOffset + 2 + i * (size + 5) + size / 2)
            .style("fill", (d) => color(d))
            .text((d) => d)
            .attr("text-anchor", "left")
            .style("alignment-baseline", "middle");

        var mouseG = svg.append("g").attr("class", "mouse-over-effects");

        // This is the black vertical line to follow the mouse.
        mouseG
            .append("path")
            .attr("class", "mouse-line")
            .style("stroke", "black")
            .style("stroke-width", "1px")
            .style("opacity", "0");

        // We can't get mouse events on a g element so we add this.
        mouseG
            .append("svg:rect")
            .attr("width", width)
            .attr("height", height)
            .attr("fill", "none")
            .attr("pointer-events", "all")
            .on("mouseout", () => {
                d3.select(".mouse-line").style("opacity", "0");
            })
            .on("mouseover", () => {
                d3.select(".mouse-line").style("opacity", "1");
                d3.select("#details").text("");
            })
            // We need to use function and not an arrow to get the right
            // "this".
            .on("mousemove", function () {
                var mouse = d3.mouse(this);
                d3.select(".mouse-line").attr("d", () => {
                    var d = "M" + mouse[0] + "," + height;
                    d += " " + mouse[0] + "," + 0;
                    return d;
                });

                var key = x.invert(mouse[0]);
                if (key.getHours() > 12) {
                    key.setDate(key.getDate() + 1);
                }
                key = keyF(new Date(key.toDateString()));
                var thisDay = byDay[key];
                // 2020-11-26 is missing data.
                if (typeof thisDay == "undefined") {
                    return;
                }

                d3.selectAll("#details > *").remove();
                var details = d3.select("#details");
                details.append("h2").text(key);

                var table = details.append("table");
                var head = table.append("tr");
                head.append("th").text("");
                head.append("th").text("New cases");

                var firstDate = firstDay[Object.keys(firstDay)[0]].day;
                head.append("th").text("Change vs " + keyF(firstDate));

                var keys = Object.keys(thisDay);
                keys.sort();
                keys.forEach((k) => {
                    var tr = table.append("tr");
                    tr.append("td").text(k);
                    tr.append("td").attr("class", "diff").text(thisDay[k].diff);
                    var mult = Math.round((thisDay[k].diff / firstDay[k].diff) * 10) / 10;
                    tr.append("td")
                        .attr("class", "multiply")
                        .text(mult + "x");
                });
            });
    });
}
