function makeCharts() {
    d3.json("summary.json").then((data) => {
        var dateParser = d3.utcParse("%Y-%m-%d");
        var dateFormatter = d3.utcFormat("%Y-%m-%d");

        var byDay = {};
        data = data.filter((d) => +d.diff > 0);
        data.forEach((d) => {
            d.day = dateParser(d.day);
            d.sub_province = d.sub_province.replaceAll(/^\*\*|\*\*$/g, "");

            if (typeof d.seven_day_average === "undefined") {
                return;
            }

            var key = dateFormatter(d.day);
            if (typeof byDay[key] === "undefined") {
                byDay[key] = {};
            }
            byDay[key][d.sub_province] = d;
        });

        makeOneChart(
            data,
            byDay,
            dateFormatter,
            "#by-population",
            false,
            (v, d) => v / (d.population / 10000),
            (v) => Math.round(v * 100) / 100
        );
        makeOneChart(
            data,
            byDay,
            dateFormatter,
            "#raw",
            true,
            (v, d) => v,
            (v) => Math.round(v * 10) / 10,
        );
    });
}

function makeOneChart(data, byDay, dateFormatter, id, includeRaw, munger, rounder) {
    var margin = {
            top: 10,
            right: 30,
            bottom: 30,
            left: 50,
        },
        width = 1000 - margin.left - margin.right,
        height = 800 - margin.top - margin.bottom;

    var prefix = id;

    var svg = d3
        .select(prefix)
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var x = d3
        .scaleTime()
        .domain(d3.extent(data, (d) => d.day))
        .range([0, width]);
    svg.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x));

    var y = d3
        .scaleLinear()
        .domain([0, d3.max(data, (d) => +munger(d.diff, d))])
        .range([height, 0]);
    svg.append("g").call(d3.axisLeft(y));

    var diffs = d3
        .nest()
        .key((d) => d.sub_province)
        .entries(data);
    var keys = diffs.map((d) => d.key);
    var color = d3.scaleOrdinal().domain(keys).range(d3.schemeSet2);

    if (includeRaw) {
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
                    .y((d) => y(+munger(d.diff, d)))(d.values)
            );
    }

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
                .y((d) => y(+munger(d.seven_day_average, d)))(d.values)
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

    var mouseLineID = id + "-mouse-line";
    // This is the black vertical line to follow the mouse.
    mouseG
        .append("path")
        .attr("id", mouseLineID.substr(1))
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
            d3.select(mouseLineID).style("opacity", "0");
        })
        .on("mouseover", () => {
            d3.select(mouseLineID).style("opacity", "1");
            d3.select(prefix + "-details").text("");
        })
        // We need to use function and not an arrow to get the right
        // "this".
        .on("mousemove", function () {
            var mouse = d3.mouse(this);
            d3.select(mouseLineID).attr("d", () => {
                var d = "M" + mouse[0] + "," + height;
                d += " " + mouse[0] + "," + 0;
                return d;
            });

            var mouseDate = x.invert(mouse[0]);
            if (mouseDate.getHours() > 12) {
                mouseDate.setDate(mouseDate.getDate() + 1);
            }
            mouseDate = dateFormatter(new Date(mouseDate.toDateString()));
            var thisDay = byDay[mouseDate];
            // 2020-11-26 is missing data.
            if (typeof thisDay == "undefined") {
                return;
            }

            d3.selectAll(prefix + "-details > *").remove();
            var details = d3.select(prefix + "-details");
            details.append("h2").text(mouseDate);

            var table = details.append("table");
            var head = table.append("tr");
            head.append("th").text("");
            head.append("th").text("Avg new cases");

            var firstDay = byDay[Object.keys(byDay).sort()[0]];
            var firstDate = firstDay[Object.keys(firstDay)[0]].day;
            head.append("th").text("Change vs " + dateFormatter(firstDate));

            var keys = Object.keys(thisDay);
            keys.sort((a, b) => {
                if (a == "State") {
                    return -1;
                } else if (b == "State") {
                    return 1;
                }
                return a < b;
            });
            keys.forEach((k) => {
                var tr = table.append("tr");
                tr.append("td").text(k);
                var dk = thisDay[k];
                tr.append("td")
                    .attr("class", "seven_day_average")
                    .text(rounder(munger(dk.seven_day_average, dk)));
                var mult =
                    Math.round(
                        (munger(dk.seven_day_average, dk) /
                            munger(firstDay[k].seven_day_average, firstDay[k])) *
                            10
                    ) / 10;
                tr.append("td")
                    .attr("class", "multiply")
                    .text(mult + "x");
            });
        });
}
