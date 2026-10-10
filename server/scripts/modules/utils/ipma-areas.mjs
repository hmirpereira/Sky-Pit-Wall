// IPMA warning areas (idAreaAviso), numbered for the settings drop-down (0 = none).
// Names as shown on the Hazards screen, in Portuguese like the warnings themselves.
const IPMA_AREAS = [
	[1, 'AVR', 'Distrito de Aveiro'],
	[2, 'BJA', 'Distrito de Beja'],
	[3, 'BRG', 'Distrito de Braga'],
	[4, 'BGC', 'Distrito de Braganca'],
	[5, 'CBO', 'Distrito de Castelo Branco'],
	[6, 'CBR', 'Distrito de Coimbra'],
	[7, 'EVR', 'Distrito de Evora'],
	[8, 'FAR', 'Distrito de Faro'],
	[9, 'GDA', 'Distrito da Guarda'],
	[10, 'LRA', 'Distrito de Leiria'],
	[11, 'LSB', 'Distrito de Lisboa'],
	[12, 'PTG', 'Distrito de Portalegre'],
	[13, 'PTO', 'Distrito do Porto'],
	[14, 'STM', 'Distrito de Santarem'],
	[15, 'STB', 'Distrito de Setubal'],
	[16, 'VCT', 'Distrito de Viana do Castelo'],
	[17, 'VRL', 'Distrito de Vila Real'],
	[18, 'VIS', 'Distrito de Viseu'],
	[19, 'MCS', 'Madeira, costa sul'],
	[20, 'MPS', 'Porto Santo'],
	[21, 'AOR', 'Acores, grupo oriental'],
	[22, 'ACE', 'Acores, grupo central'],
	[23, 'AOC', 'Acores, grupo ocidental'],
];

const ipmaArea = (number) => {
	const found = IPMA_AREAS.find(([n]) => n === Number(number));
	return found ? { id: found[1], name: found[2] } : null;
};

export { IPMA_AREAS, ipmaArea };
